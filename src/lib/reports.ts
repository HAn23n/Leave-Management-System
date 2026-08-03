import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";

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

  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.teamId) query = query.eq("team_id", filters.teamId);
  if (filters.leaveTypeId) query = query.eq("leave_type_id", filters.leaveTypeId);
  if (filters.status && (VALID_STATUSES as string[]).includes(filters.status)) {
    query = query.eq("status", filters.status as LeaveStatus);
  }
  if (filters.from) query = query.gte("end_date", filters.from);
  if (filters.to) query = query.lte("start_date", filters.to);

  return query;
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
    userIds.length ? supabase.from("users").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    leaveTypeIds.length
      ? supabase.from("leave_types").select("id, name").in("id", leaveTypeIds)
      : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ]);

  return {
    userMap: new Map((users ?? []).map((u) => [u.id, u.full_name])),
    leaveTypeMap: new Map((leaveTypes ?? []).map((lt) => [lt.id, lt.name])),
    teamMap: new Map((teams ?? []).map((t) => [t.id, t.name])),
  };
}
