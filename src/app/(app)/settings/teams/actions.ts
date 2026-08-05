"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addTeamLead } from "@/lib/approval-chain";

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
 * account (any team, not just this one) or hasn't signed in yet, and for as
 * many teams as needed either way. An existing account is added to the
 * chain immediately (role follows automatically — see the
 * trg_team_leads_sync_role trigger); an unknown email is queued in
 * pending_team_leads (one row per team) and consumed on their first Google
 * login (see src/app/auth/callback/route.ts), so the whole chain can be set
 * up in advance even before anyone involved has ever signed in.
 */
export async function assignTeamLeadByEmail(formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id"));
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return;

  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase.from("users").select("id, team_id").eq("email", email).maybeSingle();

  if (!user) {
    // Not signed up yet — queue this team's assignment for their first
    // login. approval_order left null: resolved against the real chain at
    // consume time, so it stays correct even if other people join the chain
    // in the meantime. onConflict targets (email, team_id) — adding a 2nd,
    // 3rd, ... team just adds another row, it never overwrites an earlier
    // pending team.
    await supabase
      .from("pending_team_leads")
      .upsert({ email, team_id: teamId, approval_order: null }, { onConflict: "email,team_id" });
    revalidatePath("/settings/teams");
    return;
  }

  // Fill in a missing team assignment (e.g. an approver added before ever
  // being put on a team) — but never override an existing different team.
  if (!user.team_id) {
    await supabase.from("users").update({ team_id: teamId }).eq("id", user.id);
  }

  // A person can lead more than one team at once — no cleanup of their
  // other team_leads rows here. New lead goes last in the approval order
  // (e.g. adding a 2nd lead makes them the level-2 approver, after the
  // existing level 1); addTeamLead retries if a concurrent assignment to
  // the same team raced for the same order.
  await addTeamLead(supabase, teamId, user.id);
  revalidatePath("/settings/teams");
  revalidatePath("/settings/users");
}

export async function removePendingInvite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  await supabase.from("pending_team_leads").delete().eq("id", id);
  revalidatePath("/settings/teams");
}

/**
 * Moves this lead one step earlier/later in the team's sequential approval
 * chain — a single atomic DB function (move_team_lead, migration 0018)
 * rather than 3 separate client-side updates, since an interruption
 * partway through an unwrapped multi-step swap could leave a lead
 * permanently stuck at the swap's sentinel order value.
 */
export async function moveTeamLead(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const direction = String(formData.get("direction"));

  const supabase = createServerSupabaseClient();
  await supabase.rpc("move_team_lead", { p_id: id, p_direction: direction });

  revalidatePath("/settings/teams");
}

export async function removeTeamLead(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  // Role demotion (if this was their last team) follows automatically —
  // see trg_team_leads_sync_role.
  await supabase.from("team_leads").delete().eq("id", id);

  revalidatePath("/settings/teams");
  revalidatePath("/settings/users");
}
