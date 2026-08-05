"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addTeamLead } from "@/lib/approval-chain";
import type { Database, UserRole } from "@/lib/supabase/types";

const VALID_ROLES: UserRole[] = ["admin", "approver", "user"];

export async function updateUserRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!VALID_ROLES.includes(role as UserRole)) return;

  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase.from("users").select("role").eq("id", id).maybeSingle();
  await supabase.from("users").update({ role: role as UserRole }).eq("id", id);

  // Demoting away from approver leaves any team_leads rows contradicting
  // the new role (trg_team_leads_sync_role reacts to team_leads changes,
  // not to a direct role edit, so this direction still needs handling
  // here). Promoting *to* approver deliberately does NOT auto-add them to
  // any team — use the "ทีมที่ดูแลอนุมัติ" checkboxes below for that.
  if (user?.role === "approver" && role !== "approver") {
    await supabase.from("team_leads").delete().eq("user_id", id);
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

// A person's home team (users.team_id, for filing their own leave) is
// independent of which teams they approve for (team_leads) — an approver
// can lead any number of teams regardless of their own home team, managed
// explicitly via updateApprovedTeams below.
export async function updateUserTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const rawTeamId = String(formData.get("team_id") || "");
  const teamId = rawTeamId === "none" ? "" : rawTeamId;

  const supabase = createServerSupabaseClient();
  await supabase.from("users").update({ team_id: teamId || null }).eq("id", id);

  revalidatePath("/settings/users");
}

async function syncApprovedTeams(supabase: SupabaseClient<Database>, userId: string, teamIds: string[]) {
  const { data: current } = await supabase.from("team_leads").select("id, team_id").eq("user_id", userId);
  const currentTeamIds = new Set((current ?? []).map((c) => c.team_id));
  const nextTeamIds = new Set(teamIds);

  const toRemove = (current ?? []).filter((c) => !nextTeamIds.has(c.team_id));
  if (toRemove.length > 0) {
    await supabase
      .from("team_leads")
      .delete()
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  // Role follows automatically from team_leads membership either direction
  // — see trg_team_leads_sync_role (migration 0018).
  for (const teamId of teamIds) {
    if (currentTeamIds.has(teamId)) continue;
    await addTeamLead(supabase, teamId, userId);
  }
}

export async function updateApprovedTeams(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamIds = formData.getAll("team_ids").map(String);

  const supabase = createServerSupabaseClient();
  await syncApprovedTeams(supabase, id, teamIds);

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

export async function selectAllApprovedTeams(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  const { data: teams } = await supabase.from("teams").select("id").eq("is_active", true);
  await syncApprovedTeams(
    supabase,
    id,
    (teams ?? []).map((t) => t.id)
  );

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

export async function setUserActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("is_active") === "true";

  const supabase = createServerSupabaseClient();
  await supabase.from("users").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/settings/users");
}
