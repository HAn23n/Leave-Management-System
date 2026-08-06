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
  emails: string[];
}

/**
 * The team's currently-configured approval chain for each request — not a
 * historical reconstruction of who actually acted (leave_request_logs would
 * be needed for that, and free-text log notes aren't a reliable source to
 * parse a level number back out of). If a team's chain has changed since a
 * given request was filed, this reflects the chain as it stands today.
 * Batched across all rows (not one resolveApprovalChain call per row) since
 * a report can list many requests at once.
 */
export async function loadApprovalChainsForReport(
  supabase: SupabaseClient<Database>,
  requests: Pick<LeaveRequest, "id" | "user_id" | "team_id">[]
): Promise<Map<string, ReportApprovalLevel[]>> {
  const userIds = Array.from(new Set(requests.map((r) => r.user_id)));
  const teamIds = Array.from(new Set(requests.map((r) => r.team_id)));

  const [{ data: overrides }, { data: leads }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("approver_mappings").select("user_id, approver_id").in("user_id", userIds)
      : Promise.resolve({ data: [] as { user_id: string; approver_id: string }[] }),
    teamIds.length > 0
      ? supabase.from("team_leads").select("team_id, user_id, approval_order").in("team_id", teamIds)
      : Promise.resolve({ data: [] as { team_id: string; user_id: string; approval_order: number }[] }),
  ]);

  const approverIds = Array.from(
    new Set([...(overrides ?? []).map((o) => o.approver_id), ...(leads ?? []).map((l) => l.user_id)])
  );
  const { data: approverUsers } =
    approverIds.length > 0
      ? await supabase.from("users").select("id, email").in("id", approverIds)
      : { data: [] as { id: string; email: string }[] };
  const emailMap = new Map((approverUsers ?? []).map((u) => [u.id, u.email]));

  const overridesByUser = new Map<string, string[]>();
  for (const o of overrides ?? []) {
    const email = emailMap.get(o.approver_id);
    if (!email) continue;
    const list = overridesByUser.get(o.user_id) ?? [];
    list.push(email);
    overridesByUser.set(o.user_id, list);
  }

  const leadsByTeam = new Map<string, ReportApprovalLevel[]>();
  for (const l of leads ?? []) {
    const email = emailMap.get(l.user_id);
    if (!email) continue;
    const levels = leadsByTeam.get(l.team_id) ?? [];
    const existing = levels.find((lv) => lv.level === l.approval_order);
    if (existing) existing.emails.push(email);
    else levels.push({ level: l.approval_order, emails: [email] });
    leadsByTeam.set(l.team_id, levels);
  }
  for (const levels of leadsByTeam.values()) levels.sort((a, b) => a.level - b.level);

  const result = new Map<string, ReportApprovalLevel[]>();
  for (const r of requests) {
    const overrideEmails = overridesByUser.get(r.user_id);
    result.set(r.id, overrideEmails && overrideEmails.length > 0 ? [{ level: 1, emails: overrideEmails }] : (leadsByTeam.get(r.team_id) ?? []));
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
    userIds.length ? supabase.from("users").select("id, email").in("id", userIds) : Promise.resolve({ data: [] }),
    leaveTypeIds.length
      ? supabase.from("leave_types").select("id, name").in("id", leaveTypeIds)
      : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
  ]);

  return {
    userMap: new Map((users ?? []).map((u) => [u.id, u.email])),
    leaveTypeMap: new Map((leaveTypes ?? []).map((lt) => [lt.id, lt.name])),
    teamMap: new Map((teams ?? []).map((t) => [t.id, t.name])),
  };
}
