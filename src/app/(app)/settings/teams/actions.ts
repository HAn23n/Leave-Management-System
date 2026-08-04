"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").insert({ name });
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

export async function addTeamLead(formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id"));
  const userId = String(formData.get("user_id"));
  if (!userId) return;

  const supabase = createServerSupabaseClient();

  // A team lead only actually gets approval rights via role='approver' +
  // team_id — team_leads itself just drives email routing (resolveApprovers).
  // Promoting here keeps "add as team lead" a single, complete action instead
  // of a two-step (also go set their role on the Users page) that's easy to
  // forget. Never touch an existing admin's role.
  const { data: user } = await supabase.from("users").select("role, team_id").eq("id", userId).maybeSingle();
  if (user && user.role === "user" && user.team_id === teamId) {
    await supabase.from("users").update({ role: "approver" }).eq("id", userId);
  }

  // A user can only lead one team at a time (mirrors updateUserTeam's cleanup
  // when a user's team_id changes) — drop any other team's lead row for them
  // before adding this one.
  await supabase.from("team_leads").delete().eq("user_id", userId).neq("team_id", teamId);

  // ignoreDuplicates: re-adding an existing lead (team_id, user_id) is a
  // harmless no-op instead of a swallowed unique-violation error.
  await supabase
    .from("team_leads")
    .upsert({ team_id: teamId, user_id: userId }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
  revalidatePath("/settings/teams");
  revalidatePath("/settings/users");
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
