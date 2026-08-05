"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nextApprovalOrder } from "@/lib/approval-chain";

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").insert({ name });
  revalidatePath("/settings/teams");
}

export async function renameTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").update({ name }).eq("id", id);
  revalidatePath("/settings/teams");
}

export async function setTeamActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("is_active") === "true";

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/settings/teams");
}

/**
 * Assigns a team lead by email — works whether that person already has an
 * account (any team, not just this one) or hasn't signed in yet. An
 * existing account is promoted/added to the chain immediately; an unknown
 * email is queued in pending_user_roles and consumed on their first Google
 * login (see src/app/auth/callback/route.ts), so the role/team/approval
 * order can be set up entirely in advance.
 */
export async function assignTeamLeadByEmail(formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id"));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;

  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase.from("users").select("id, role, team_id").eq("email", email).maybeSingle();

  if (!user) {
    // Not signed up yet — queue the assignment for their first login.
    // approval_order left null: resolved against the real chain at consume
    // time (nextApprovalOrder), so it stays correct even if other people
    // join the chain in the meantime.
    await supabase
      .from("pending_user_roles")
      .upsert({ email, role: "approver", team_id: teamId, approval_order: null }, { onConflict: "email" });
    revalidatePath("/settings/teams");
    return;
  }

  // A team lead only actually gets approval rights via role='approver' +
  // team_leads — promoting here keeps "assign as lead" a single, complete
  // action instead of a two-step (also go set their role on the Users page)
  // that's easy to forget. Never touch an existing admin's role.
  if (user.role === "user") {
    await supabase.from("users").update({ role: "approver" }).eq("id", user.id);
  }
  // Fill in a missing team assignment (e.g. an approver added before ever
  // being put on a team) — but never override an existing different team.
  if (!user.team_id) {
    await supabase.from("users").update({ team_id: teamId }).eq("id", user.id);
  }

  // A user can only lead one team at a time (mirrors updateUserTeam's cleanup
  // when a user's team_id changes) — drop any other team's lead row for them
  // before adding this one.
  await supabase.from("team_leads").delete().eq("user_id", user.id).neq("team_id", teamId);

  // New lead goes last in the approval order (e.g. adding a 2nd lead makes
  // them the level-2 approver, after the existing level 1).
  const nextOrder = await nextApprovalOrder(supabase, teamId);

  // ignoreDuplicates: re-adding an existing lead (team_id, user_id) is a
  // harmless no-op instead of a swallowed unique-violation error.
  await supabase.from("team_leads").upsert(
    { team_id: teamId, user_id: user.id, approval_order: nextOrder },
    { onConflict: "team_id,user_id", ignoreDuplicates: true }
  );
  revalidatePath("/settings/teams");
  revalidatePath("/settings/users");
}

export async function removePendingInvite(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));

  const supabase = createServerSupabaseClient();
  await supabase.from("pending_user_roles").delete().eq("email", email);
  revalidatePath("/settings/teams");
}

/**
 * Swaps this lead's approval_order with its neighbor in the other direction
 * — moving them one step earlier/later in the team's sequential approval
 * chain. A no-op at either end of the list.
 */
export async function moveTeamLead(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const direction = String(formData.get("direction"));

  const supabase = createServerSupabaseClient();
  const { data: lead } = await supabase.from("team_leads").select("team_id, approval_order").eq("id", id).maybeSingle();
  if (!lead) return;

  const { data: siblings } = await supabase
    .from("team_leads")
    .select("id, approval_order")
    .eq("team_id", lead.team_id)
    .order("approval_order");
  if (!siblings) return;

  const index = siblings.findIndex((s) => s.id === id);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || neighborIndex < 0 || neighborIndex >= siblings.length) return;

  const neighbor = siblings[neighborIndex];
  const current = siblings[index];

  // Swapping directly (two parallel updates) can hit the unique
  // (team_id, approval_order) constraint mid-flight — e.g. setting current's
  // order to neighbor's value while neighbor still holds it. Route through a
  // value outside the valid range first so the two updates never collide.
  await supabase.from("team_leads").update({ approval_order: -1 }).eq("id", current.id);
  await supabase.from("team_leads").update({ approval_order: current.approval_order }).eq("id", neighbor.id);
  await supabase.from("team_leads").update({ approval_order: neighbor.approval_order }).eq("id", current.id);

  revalidatePath("/settings/teams");
}

export async function removeTeamLead(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  const { data: lead } = await supabase.from("team_leads").select("user_id").eq("id", id).maybeSingle();
  await supabase.from("team_leads").delete().eq("id", id);

  // Mirror addTeamLead's auto-promotion: if this was their last team, they no
  // longer lead anything, so drop the approver role back to plain user
  // (never touch admin).
  if (lead) {
    const { data: user } = await supabase.from("users").select("role").eq("id", lead.user_id).maybeSingle();
    const { count } = await supabase
      .from("team_leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", lead.user_id);
    if (user?.role === "approver" && !count) {
      await supabase.from("users").update({ role: "user" }).eq("id", lead.user_id);
    }
  }

  revalidatePath("/settings/teams");
  revalidatePath("/settings/users");
}
