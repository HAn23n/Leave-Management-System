import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppUser, Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";
import { notifyLeaveDecision, notifyNewLeaveRequest } from "@/lib/email";
import { resolveApprovalChain } from "@/lib/approval-chain";
import { safeDbErrorMessage } from "@/lib/db-error";

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
  /** Explicit current_level to set — used to reset the chain to level 1 on 'returned'. */
  currentLevel?: number;
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
  currentLevel,
}: TransitionParams): Promise<TransitionResult> {
  const updatePayload: Partial<LeaveRequest> = { status: toStatus };
  if (approverId !== undefined) updatePayload.approver_id = approverId;
  if (approverNote !== undefined) updatePayload.approver_note = approverNote;
  if (currentLevel !== undefined) updatePayload.current_level = currentLevel;

  const { data, error } = await supabase
    .from("leave_requests")
    .update(updatePayload)
    .eq("id", id)
    .in("status", fromStatuses)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "db_error", message: safeDbErrorMessage(error) };
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
 * Shared by the approve/reject/return routes. Enforces the sequential
 * approval chain: only the approver assigned to the request's current level
 * (or an override approver, or an admin) may act on it. An 'approved'
 * decision that isn't the chain's last level just advances current_level and
 * notifies the next approver — the document stays 'pending' until every
 * level has signed off. Reject/return are always terminal regardless of
 * level. Notification failures never roll back or mask a decision that
 * already committed.
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
  const { data: current } = await supabase
    .from("leave_requests")
    .select("id, status, team_id, user_id, current_level, leave_type_id, start_date, end_date, request_no, total_days")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== "pending") return { ok: false, reason: "conflict" };

  const chain = await resolveApprovalChain({ userId: current.user_id, teamId: current.team_id });
  const isAuthorized =
    actor.role === "admin" ||
    (chain.type === "override"
      ? chain.levels.some((l) => l.approver.id === actor.id)
      : chain.levels.some((l) => l.level === current.current_level && l.approver.id === actor.id));

  if (!isAuthorized) {
    return { ok: false, reason: "db_error", message: "ยังไม่ถึงลำดับอนุมัติของคุณ" };
  }

  const maxLevel = chain.type === "override" ? 1 : chain.levels.length;
  const isLastLevel = chain.type === "override" || actor.role === "admin" || current.current_level >= maxLevel;

  if (decision === "approved" && !isLastLevel) {
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ current_level: current.current_level + 1, approver_id: actor.id, approver_note: note })
      .eq("id", id)
      .eq("status", "pending")
      .eq("current_level", current.current_level)
      .select("*")
      .maybeSingle();

    if (error) return { ok: false, reason: "db_error", message: safeDbErrorMessage(error) };
    if (!data) return { ok: false, reason: "conflict" };

    // The status-change trigger only logs when `status` itself changes — this
    // step keeps it 'pending', so log the level advance manually.
    await supabase.from("leave_request_logs").insert({
      request_id: id,
      actor_id: actor.id,
      from_status: "pending",
      to_status: "pending",
      note: note ? `อนุมัติลำดับที่ ${current.current_level}: ${note}` : `อนุมัติลำดับที่ ${current.current_level}`,
    });

    try {
      const nextLevel = chain.levels.find((l) => l.level === current.current_level + 1);
      if (nextLevel) {
        const [{ data: requester }, { data: leaveType }] = await Promise.all([
          supabase.from("users").select("email").eq("id", current.user_id).single(),
          supabase.from("leave_types").select("name").eq("id", current.leave_type_id).single(),
        ]);
        if (requester) {
          await notifyNewLeaveRequest({
            approverEmail: nextLevel.approver.email,
            requesterEmail: requester.email,
            requestNo: current.request_no,
            leaveTypeName: leaveType?.name ?? "",
            startDate: current.start_date,
            endDate: current.end_date,
            totalDays: current.total_days,
            requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${current.request_no}`,
          });
        }
      }
    } catch {
      // Non-fatal — see comment above.
    }

    return { ok: true, request: data };
  }

  // Terminal transition: fully approved (last level, override, or admin), rejected, or returned.
  const result = await transitionLeaveRequest({
    supabase,
    id,
    fromStatuses: ["pending"],
    toStatus: decision,
    approverId: actor.id,
    approverNote: note,
    // A returned request restarts the chain from level 1 on its next submission.
    currentLevel: decision === "returned" ? 1 : undefined,
  });

  if (!result.ok) return result;

  const requestRow = result.request!;
  try {
    const [{ data: requester }, { data: leaveType }] = await Promise.all([
      supabase.from("users").select("email").eq("id", requestRow.user_id).single(),
      supabase.from("leave_types").select("name").eq("id", requestRow.leave_type_id).single(),
    ]);

    if (requester) {
      await notifyLeaveDecision({
        requesterEmail: requester.email,
        requestNo: requestRow.request_no,
        leaveTypeName: leaveType?.name ?? "",
        startDate: requestRow.start_date,
        endDate: requestRow.end_date,
        decision,
        approverEmail: actor.email,
        approverNote: note,
        requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${requestRow.request_no}`,
      });
    }
  } catch {
    // Non-fatal — see comment above.
  }

  return result;
}
