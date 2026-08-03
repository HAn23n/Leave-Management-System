"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const VALID_ROLES: UserRole[] = ["admin", "approver", "user"];

export async function updateUserRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!VALID_ROLES.includes(role as UserRole)) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("users").update({ role: role as UserRole }).eq("id", id);
  revalidatePath("/settings/users");
}

export async function updateUserTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamId = String(formData.get("team_id") || "");

  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({ team_id: teamId || null })
    .eq("id", id);

  // Only clean up team_leads once the team change itself actually succeeded
  // (it can be rejected by the guard_and_log_team_change trigger when the
  // user has a pending/approved request). Otherwise a user moved off a team
  // kept showing up as that team's lead — still notified/listed for requests
  // they can no longer act on.
  if (!error) {
    let cleanup = supabase.from("team_leads").delete().eq("user_id", id);
    cleanup = teamId ? cleanup.neq("team_id", teamId) : cleanup;
    await cleanup;
  }

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
