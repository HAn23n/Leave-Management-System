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
  const { data: user } = await supabase.from("users").select("role, team_id").eq("id", id).maybeSingle();
  await supabase.from("users").update({ role: role as UserRole }).eq("id", id);

  // Keep team_leads (used for approval-notification routing) in sync with
  // role, regardless of which settings screen the admin used.
  if (user) {
    if (role === "approver" && user.team_id) {
      await supabase
        .from("team_leads")
        .upsert(
          { team_id: user.team_id, user_id: id },
          { onConflict: "team_id,user_id", ignoreDuplicates: true }
        );
    } else if (role !== "approver" && user.role === "approver") {
      await supabase.from("team_leads").delete().eq("user_id", id);
    }
  }

  revalidatePath("/settings/users");
  revalidatePath("/settings/teams");
}

export async function updateUserTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamId = String(formData.get("team_id") || "");

  const supabase = createServerSupabaseClient();
  const { data: user } = await supabase.from("users").select("role").eq("id", id).maybeSingle();
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

    // An approver moved to a new team keeps leading (just the new team) —
    // re-add the team_leads row so approval-notification routing follows them.
    if (teamId && user?.role === "approver") {
      await supabase
        .from("team_leads")
        .upsert({ team_id: teamId, user_id: id }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
    }
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
