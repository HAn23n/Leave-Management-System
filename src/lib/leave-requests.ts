import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppUser, Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";
import { notifyLeaveDecision } from "@/lib/email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Looks a request up by its friendly request_no (the normal URL param since
 * request_no-based routing replaced raw UUIDs), falling back to matching by
 * id so any link shared before that change keeps resolving. Branches on
 * shape rather than interpolating the param into an .or() filter string,
 * since PostgREST parses that as its own mini-DSL — raw user input there
 * risks filter injection.
 */
export async function findLeaveRequestByParam(supabase: SupabaseClient<Database>, requestNoOrId: string) {
  const { data } = await supabase
    .from("leave_requests")
    .select("*")
    .eq(UUID_RE.test(requestNoOrId) ? "id" : "request_no", requestNoOrId)
    .maybeSingle();
  return data;
}

interface TransitionParams {
  supabase: SupabaseClient<Database>;
  id: string;
  fromStatuses: LeaveStatus[];
  toStatus: LeaveStatus;
  approverId?: string | null;
  approverNote?: string | null;
}

interface TransitionResult {
  ok: boolean;
  request?: LeaveRequest;
  /** "not_found" = no row with that id/scope, "conflict" = optimistic-lock mismatch (status already moved), "db_error" = a trigger/constraint rejected the write (e.g. overlap) */
  reason?: "not_found" | "conflict" | "db_error";
  /** Set on "db_error" — the actual Postgres/trigger message (already Thai), safe to show the user directly. */
  message?: string;
}

/**
 * Single UPDATE ... WHERE id = $1 AND status = ANY($2) is atomic in Postgres and
 * gives us the optimistic lock for free: if another request already moved the
 * status, zero rows match and we report a conflict instead of silently
 * clobbering it. RLS (see migration 0001) still applies on top of this since we
 * run it through the caller's own session client, not the service-role client.
 */
export async function transitionLeaveRequest({
  supabase,
  id,
  fromStatuses,
  toStatus,
  approverId,
  approverNote,
}: TransitionParams): Promise<TransitionResult> {
  const updatePayload: Partial<LeaveRequest> = { status: toStatus };
  if (approverId !== undefined) updatePayload.approver_id = approverId;
  if (approverNote !== undefined) updatePayload.approver_note = approverNote;

  const { data, error } = await supabase
    .from("leave_requests")
    .update(updatePayload)
    .eq("id", id)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();

  if (error) {
    // A trigger (e.g. the overlap check) rejected the write — its message is
    // already a user-facing Thai string, safe to surface directly.
    return { ok: false, reason: "db_error", message: error.message };
  }

  if (!data) {
    // Either the row doesn't exist/isn't visible to this user (RLS), or its
    // status no longer matches fromStatuses (someone else already acted on it).
    const { data: current } = await supabase
      .from("leave_requests")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    return { ok: false, reason: current ? "conflict" : "not_found" };
  }

  return { ok: true, request: data };
}

/**
 * Shared by the approve/reject/return routes: moves a pending request out of
 * pending and, best-effort, emails the requester. Notification failures never
 * roll back or mask the decision that already committed above.
 */
export async function decideOnPendingRequest({
  supabase,
  id,
  actor,
  decision,
  note,
}: {
  supabase: SupabaseClient<Database>;
  id: string;
  actor: AppUser;
  decision: "approved" | "rejected" | "returned";
  note: string | null;
}): Promise<TransitionResult> {
  const result = await transitionLeaveRequest({
    supabase,
    id,
    fromStatuses: ["pending"],
    toStatus: decision,
    approverId: actor.id,
    approverNote: note,
  });

  if (!result.ok) return result;

  const requestRow = result.request!;
  try {
    const [{ data: requester }, { data: leaveType }] = await Promise.all([
      supabase.from("users").select("email, full_name").eq("id", requestRow.user_id).single(),
      supabase.from("leave_types").select("name").eq("id", requestRow.leave_type_id).single(),
    ]);

    if (requester) {
      await notifyLeaveDecision({
        requesterEmail: requester.email,
        requesterName: requester.full_name,
        requestNo: requestRow.request_no,
        leaveTypeName: leaveType?.name ?? "",
        startDate: requestRow.start_date,
        endDate: requestRow.end_date,
        decision,
        approverName: actor.full_name,
        approverNote: note,
        requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${requestRow.request_no}`,
      });
    }
  } catch {
    // Non-fatal — see comment above.
  }

  return result;
}
