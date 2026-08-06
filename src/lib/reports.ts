import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";
import { displayName } from "@/lib/users";

export interface ReportFilters {
  userId?: string;
  teamId?: string;
  leaveTypeId?: string;
  status?: string;
  from?: string;
  to?: string;
}

const VALID_STATUSES: LeaveStatus[] = ["draft", "pending", "approved", "rejected", "cancelled", "returned"];

/**
 * Builds the filtered leave_requests query for the reports screen and its
 * Excel export — run through the caller's own RLS-scoped session client, so
 * a 'user' only ever gets their own rows and an approver only their team's,
 * no matter what filters are passed in.
 */
export function buildReportQuery(supabase: SupabaseClient<Database>, filters: ReportFilters) {
  let query = supabase.from("leave_requests").select("*").order("start_date", { ascending: false });

  if (filters.userId && filters.userId !== "all") query = query.eq("user_id", filters.userId);
  if (filters.teamId && filters.teamId !== "all") query = query.eq("team_id", filters.teamId);
  if (filters.leaveTypeId && filters.leaveTypeId !== "all") query = query.eq("leave_type_id", filters.leaveTypeId);
  if (filters.status && (VALID_STATUSES as string[]).includes(filters.status)) {
    query = query.eq("status", filters.status as LeaveStatus);
  }
  if (filters.from) query = query.gte("end_date", filters.from);
  if (filters.to) query = query.lte("start_date", filters.to);

  return query;
}

export interface ReportApprovalLevel {
  level: number;
  names: string[];
}

/**
 * Who actually approved each level of a request, reconstructed from
 * leave_request_logs rather than the team's currently-configured chain — a
 * team's chain can be reconfigured after a request was already decided, and
 * showing today's config would misattribute who really signed off. Only log
 * rows that represent a genuine approval action count: an intermediate
 * level sign-off (pending -> pending, written explicitly by
 * decideOnPendingRequest/skipCurrentApprover) or the final approval
 * (pending -> approved, written by the status-change trigger); submission
 * (draft/none -> pending) and reject/return are excluded since they aren't
 * "who approved this level". `level` is only populated for logs written
 * after migration 0026 — already-decided requests from before that won't
 * populate a column here. Batched across all rows (not one query per row)
 * since a report can list many requests at once.
 */
export async function loadApprovalChainsForReport(
  supabase: SupabaseClient<Database>,
  requests: Pick<LeaveRequest, "id">[]
): Promise<Map<string, ReportApprovalLevel[]>> {
  const requestIds = requests.map((r) => r.id);
  const result = new Map<string, ReportApprovalLevel[]>();
  if (requestIds.length === 0) return result;

  const { data: logs } = await supabase
    .from("leave_request_logs")
    .select("request_id, actor_id, level")
    .in("request_id", requestIds)
    .not("level", "is", null)
    .eq("from_status", "pending")
    .in("to_status", ["pending", "approved"])
    .order("created_at", { ascending: true });

  const actorIds = Array.from(new Set((logs ?? []).map((l) => l.actor_id).filter((id): id is string => !!id)));
  const { data: actorUsers } =
    actorIds.length > 0
      ? await supabase.from("users").select("id, email, nickname").in("id", actorIds)
      : { data: [] as { id: string; email: string; nickname: string | null }[] };
  const nameMap = new Map((actorUsers ?? []).map((u) => [u.id, displayName(u)]));

  const byRequest = new Map<string, ReportApprovalLevel[]>();
  for (const log of logs ?? []) {
    if (log.level == null || !log.actor_id) continue;
    const name = nameMap.get(log.actor_id);
    if (!name) continue;
    const levels = byRequest.get(log.request_id) ?? [];
    const existing = levels.find((lv) => lv.level === log.level);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
    } else {
      levels.push({ level: log.level, names: [name] });
    }
    byRequest.set(log.request_id, levels);
  }
  for (const levels of byRequest.values()) levels.sort((a, b) => a.level - b.level);

  for (const r of requests) {
    result.set(r.id, byRequest.get(r.id) ?? []);
  }
  return result;
}

export async function loadReportLookups(
  supabase: SupabaseClient<Database>,
  requests: Pick<LeaveRequest, "user_id" | "leave_type_id" | "team_id" | "approver_id">[]
) {
  const userIds = Array.from(
    new Set(requests.flatMap((r) => (r.approver_id ? [r.user_id, r.approver_id] : [r.user_id])))
  );
  const leaveTypeIds = Array.from(new Set(requests.map((r) => r.leave_type_id)));
  const teamIds = Array.from(new Set(requests.map((r) => r.team_id)));

  const [{ data: users }, { data: leaveTypes }, { data: teams }] = await Promise.all([
    userIds.length
      ? supabase.from("users").select("id, email, nickname").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; email: string; nickname: string | null }[] }),
    leaveTypeIds.length
      ? supabase.from("leave_types").select("id, name").in("id", leaveTypeIds)
      : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ]);

  return {
    userMap: new Map((users ?? []).map((u) => [u.id, displayName(u)])),
    leaveTypeMap: new Map((leaveTypes ?? []).map((lt) => [lt.id, lt.name])),
    teamMap: new Map((teams ?? []).map((t) => [t.id, t.name])),
  };
}
