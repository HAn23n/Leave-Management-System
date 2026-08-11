import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { displayName } from "@/lib/users";
import type { AppUser } from "@/lib/supabase/types";

export interface EvaluationRosterMember {
  id: string;
  email: string;
  nickname: string | null;
  team_id: string;
}

/**
 * Who the current user is allowed to evaluate this session, with the exact
 * team_id the evaluation should be scoped to. Admin sees everyone. An
 * approver only sees members of a team *they lead* (team_leads).
 *
 * Uses the admin (service-role) client deliberately, not the caller's own
 * session client: `user_teams` SELECT RLS only allows a user to read their
 * *own* membership row (see 0023_multi_team_membership.sql) — there's no
 * approver-scoped policy on it like there is on `users`/`attendance_logs`,
 * so an approver's session client can't see a teammate's user_teams row and
 * the roster would silently come back empty. This function re-derives the
 * exact same team_leads/user_teams relationship explicitly in code instead,
 * same pattern as resolveApprovalChain in lib/approval-chain.ts.
 */
export async function resolveEvaluationRoster(appUser: AppUser): Promise<EvaluationRosterMember[]> {
  const admin = createAdminSupabaseClient();

  if (appUser.role === "admin") {
    const { data } = await admin
      .from("users")
      .select("id, email, nickname, team_id")
      .eq("is_active", true)
      .not("team_id", "is", null)
      .neq("role", "admin");
    return (data ?? []).filter((u): u is EvaluationRosterMember => u.team_id != null);
  }

  const { data: leads } = await admin.from("team_leads").select("team_id").eq("user_id", appUser.id);
  const ledTeamIds = (leads ?? []).map((l) => l.team_id);
  if (ledTeamIds.length === 0) return [];

  const { data: memberships } = await admin.from("user_teams").select("user_id, team_id").in("team_id", ledTeamIds);
  if (!memberships || memberships.length === 0) return [];

  // A member could sit in more than one team this approver leads — keep the
  // first pairing found, any one of them is a valid, RLS-satisfying team_id.
  const teamByUserId = new Map<string, string>();
  for (const m of memberships) {
    if (!teamByUserId.has(m.user_id)) teamByUserId.set(m.user_id, m.team_id);
  }
  teamByUserId.delete(appUser.id); // a lead doesn't evaluate themself

  // Team membership can include co-leads or an admin who happens to sit in
  // the team roster too (e.g. for visibility) — this evaluation is for rank
  // ­-and-file reports, not other leads/admins.
  const { data: users } = await admin
    .from("users")
    .select("id, email, nickname")
    .in("id", Array.from(teamByUserId.keys()))
    .eq("is_active", true)
    .eq("role", "user");

  return (users ?? []).map((u) => ({ ...u, team_id: teamByUserId.get(u.id)! }));
}

export interface ExistingEvaluationRow {
  evaluator_id: string;
  evaluator_name: string;
  score_punctuality: number;
  score_responsibility: number;
  score_achievement: number;
  score_delivery: number;
  score_skill: number;
  total_percentage: number;
  passed: boolean;
  note: string | null;
}

/**
 * Existing evaluations for this period, keyed by user_id — via the admin
 * client for the same reason as resolveEvaluationRoster: performance_evaluations
 * SELECT RLS only shows a non-admin evaluator *their own* submissions, so a
 * second lead who also happens to be able to evaluate the same person
 * (multi-team membership) wouldn't otherwise see that someone already has —
 * exactly the duplicate-evaluation gap this exists to close.
 */
export async function loadExistingEvaluations(
  userIds: string[],
  period: string
): Promise<Map<string, ExistingEvaluationRow>> {
  if (userIds.length === 0) return new Map();

  const admin = createAdminSupabaseClient();
  const { data: rows } = await admin
    .from("performance_evaluations")
    .select("*")
    .eq("period", period)
    .in("user_id", userIds);
  if (!rows || rows.length === 0) return new Map();

  const evaluatorIds = Array.from(new Set(rows.map((r) => r.evaluator_id)));
  const { data: evaluators } = await admin.from("users").select("id, email, nickname").in("id", evaluatorIds);
  const evaluatorNameById = new Map((evaluators ?? []).map((e) => [e.id, displayName(e)]));

  return new Map(
    rows.map((r) => [
      r.user_id,
      {
        evaluator_id: r.evaluator_id,
        evaluator_name: evaluatorNameById.get(r.evaluator_id) ?? "-",
        score_punctuality: r.score_punctuality,
        score_responsibility: r.score_responsibility,
        score_achievement: r.score_achievement,
        score_delivery: r.score_delivery,
        score_skill: r.score_skill,
        total_percentage: r.total_percentage,
        passed: r.passed,
        note: r.note,
      },
    ])
  );
}
