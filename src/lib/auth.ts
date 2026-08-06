import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/supabase/types";

/** Current user (auth + row in the users table), or null if not logged in / no row yet. */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  return appUser ?? null;
}

/**
 * Use in Server Components of pages that require an authenticated user.
 * - Not logged in -> redirect to /login
 * - Logged in but no users row yet (shouldn't happen, normally created in
 *   /auth/callback) -> redirect to /login
 * - team_id still null -> redirect to team selection (unless allowNoTeam)
 * - nickname still null -> redirect to nickname entry (unless allowNoNickname)
 *   — team is checked first, so a brand-new user lands on team selection
 *   before nickname; an already-onboarded existing user (team_id already
 *   set, from before this field existed) is prompted for nickname alone.
 */
export async function requireAppUser(options?: {
  allowNoTeam?: boolean;
  allowNoNickname?: boolean;
}): Promise<AppUser> {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    redirect("/login");
  }

  if (!appUser.is_active) {
    redirect("/login?error=inactive");
  }

  if (!appUser.team_id && !options?.allowNoTeam) {
    redirect("/onboarding/team");
  }

  if (!appUser.nickname && !options?.allowNoNickname) {
    redirect("/onboarding/nickname");
  }

  return appUser;
}

export async function requireAdmin(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (appUser.role !== "admin") {
    redirect("/");
  }
  return appUser;
}

export async function requireApproverOrAdmin(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (appUser.role !== "approver" && appUser.role !== "admin") {
    redirect("/");
  }
  return appUser;
}
