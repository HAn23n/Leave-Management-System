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

  if (user?.role === "approver" && role !== "approver") {
    await supabase.from("team_leads").delete().eq("user_id", id);
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

async function syncMemberships(
  supabase: SupabaseClient<Database>,
  table: "user_teams" | "team_leads",
  userId: string,
  teamIds: string[],
  // Batched, not one call per new team — team_leads' onAdd still loops
  // internally (addTeamLead has to run one at a time to compute each new
  // lead's approval_order in sequence), but user_teams' onAdd issues a
  // single multi-row insert.
  onAdd: (teamIds: string[]) => Promise<void>
) {
  const { data: current } = await supabase.from(table).select("id, team_id").eq("user_id", userId);
  const currentTeamIds = new Set((current ?? []).map((c) => c.team_id));
  const nextTeamIds = new Set(teamIds);

  const toRemove = (current ?? []).filter((c) => !nextTeamIds.has(c.team_id));
  if (toRemove.length > 0) {
    await supabase
      .from(table)
      .delete()
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  const toAdd = teamIds.filter((id) => !currentTeamIds.has(id));
  if (toAdd.length > 0) {
    await onAdd(toAdd);
  }
}

// Which teams someone is a *member* of (files leave under, sees the team's
// records) is independent of which teams they *approve for* (team_leads,
// managed below) — a person can be a member of teams they don't lead, and
// vice versa. users.team_id (the "primary" one shown elsewhere) follows
// automatically — see sync_user_home_team, migration 0023.
export async function updateMemberTeams(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamIds = formData.getAll("team_ids").map(String);

  const supabase = createServerSupabaseClient();
  await syncMemberships(supabase, "user_teams", id, teamIds, async (toAdd) => {
    const { error } = await supabase.from("user_teams").insert(toAdd.map((teamId) => ({ user_id: id, team_id: teamId })));
    if (error) throw error;
  });

  revalidatePath("/settings/users");
}

// Role follows automatically from team_leads membership either direction —
// see trg_team_leads_sync_role (migration 0018).
export async function updateApprovedTeams(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamIds = formData.getAll("team_ids").map(String);

  const supabase = createServerSupabaseClient();
  await syncMemberships(supabase, "team_leads", id, teamIds, async (toAdd) => {
    for (const teamId of toAdd) {
      await addTeamLead(supabase, teamId, id);
    }
  });

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

const PROVISIONABLE_ROLES: UserRole[] = ["admin", "approver", "user"];

/**
 * Grants an email access to the app ahead of their first Google login.
 * First login is now gated on being pre-provisioned (see
 * src/app/auth/callback/route.ts) — anyone not added here (or as a team
 * lead via Settings → ทีม) can sign in with Google but is turned away, so
 * this is the only way a plain (non-approver) account gets in. role='approver'
 * requires at least one team checked (an approver needs a chain to lead);
 * that team assignment goes through team_leads/pending_team_leads (same as
 * Settings → ทีม's per-team assign-by-email flow) rather than
 * user_teams/pending_user_teams, since a lead's role/membership both follow
 * from being in the chain, not from being pre-set directly.
 */
export async function preProvisionUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "user");
  const teamIds = formData.getAll("team_ids").map(String);
  if (!email || !PROVISIONABLE_ROLES.includes(role as UserRole)) return;
  if (role === "approver" && teamIds.length === 0) return;

  const supabase = createServerSupabaseClient();
  const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).maybeSingle();

  if (existingUser) {
    if (role === "approver") {
      // Role follows automatically once team_leads exists (trg_team_leads_sync_role,
      // migration 0018) — no direct role update needed here. addTeamLead runs
      // one team at a time (needs to compute each new lead's approval_order
      // in sequence); a lead is always also upserted as a member.
      await supabase
        .from("user_teams")
        .upsert(
          teamIds.map((teamId) => ({ user_id: existingUser.id, team_id: teamId })),
          { onConflict: "user_id,team_id", ignoreDuplicates: true }
        );
      for (const teamId of teamIds) {
        await addTeamLead(supabase, teamId, existingUser.id);
      }
    } else {
      // Already signed in before — apply directly instead of queueing. This
      // form only grants/adds access, so team selection here is additive —
      // it never removes a team they already belong to (unlike the per-user
      // "ทีมที่เป็นสมาชิก" checklist below, which reconciles to exactly what's
      // checked). Membership goes through user_teams (users.team_id just
      // follows along — see sync_user_home_team, migration 0023).
      await supabase.from("users").update({ role: role as UserRole }).eq("id", existingUser.id);
      if (teamIds.length > 0) {
        await supabase
          .from("user_teams")
          .upsert(
            teamIds.map((teamId) => ({ user_id: existingUser.id, team_id: teamId })),
            { onConflict: "user_id,team_id", ignoreDuplicates: true }
          );
      }
    }
  } else if (role === "approver") {
    await supabase.from("pending_user_roles").upsert({ email, role: "approver" }, { onConflict: "email" });
    await supabase
      .from("pending_team_leads")
      .upsert(
        teamIds.map((teamId) => ({ email, team_id: teamId, approval_order: null })),
        { onConflict: "email,team_id" }
      );
  } else {
    await supabase.from("pending_user_roles").upsert({ email, role: role as UserRole }, { onConflict: "email" });
    if (teamIds.length > 0) {
      await supabase
        .from("pending_user_teams")
        .upsert(
          teamIds.map((teamId) => ({ email, team_id: teamId })),
          { onConflict: "email,team_id" }
        );
    }
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

export async function removePendingUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email"));

  const supabase = createServerSupabaseClient();
  await Promise.all([
    supabase.from("pending_user_roles").delete().eq("email", email),
    supabase.from("pending_user_teams").delete().eq("email", email),
    supabase.from("pending_team_leads").delete().eq("email", email),
  ]);
  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}
