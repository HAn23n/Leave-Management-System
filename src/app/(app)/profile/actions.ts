"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Self-service team membership — scoped to the caller's own id (never taken
 * from form input), so this can only ever edit your own memberships. A
 * person can belong to several teams; users.team_id (the "primary" one used
 * as a default elsewhere) follows automatically — see sync_user_home_team,
 * migration 0023, which also removed the old "must clear pending/approved
 * requests first" restriction on changing teams.
 */
export async function updateOwnTeams(formData: FormData) {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect("/login");

  const teamIds = formData.getAll("team_ids").map(String);
  // Mirrors the client-side guard in TeamMembershipForm — a user can never
  // save themselves down to zero teams, since that locks them out to
  // /onboarding/team with no way back in without an admin's help.
  if (teamIds.length === 0) return;

  const supabase = createServerSupabaseClient();

  const { data: current } = await supabase.from("user_teams").select("id, team_id").eq("user_id", appUser.id);
  const currentTeamIds = new Set((current ?? []).map((c) => c.team_id));
  const nextTeamIds = new Set(teamIds);

  const toRemove = (current ?? []).filter((c) => !nextTeamIds.has(c.team_id));
  if (toRemove.length > 0) {
    await supabase
      .from("user_teams")
      .delete()
      .in(
        "id",
        toRemove.map((r) => r.id)
      );
  }

  const toAdd = teamIds.filter((id) => !currentTeamIds.has(id));
  if (toAdd.length > 0) {
    await supabase.from("user_teams").insert(toAdd.map((teamId) => ({ user_id: appUser.id, team_id: teamId })));
  }

  revalidatePath("/profile");
}
