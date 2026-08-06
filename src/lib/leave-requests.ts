import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import type { AppUser, Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";
import { resolveApprovalChain } from "@/lib/approval-chain";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { safeDbErrorMessage } from "@/lib/db-error";
import { sendOrQueueEmail } from "@/lib/email-outbox";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether the viewing approver has already acted at their own level of this
 * request's chain — the request's overall status is still "pending" (other
 * levels remain), but from this approver's point of view it isn't waiting on
 * them anymore. Shared so the dashboard card, search list, and detail page
 * all swap the plain "รออนุมัติ" badge for "อนุมัติแล้ว รอลำดับถัดไป" the
 * same way instead of drifting between three separately-written checks.
 */
export function isAlreadyActedByApprover(
  status: LeaveStatus,
  currentLevel: number,
  ownApprovalOrder: number | null | undefined
): boolean {
  return status === "pending" && ownApprovalOrder != null && currentLevel > ownApprovalOrder;
}

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
  /** Explicit current_level to set — used to reset the chain to its lowest level on 'returned'. */
  currentLevel?: number;
}

interface TransitionResult {
  ok: boolean;
  request?: LeaveRequest;
  /** "not_found" = no row with that id/scope, "conflict" = optimistic-lock mismatch (status already moved), "db_error" = a trigger/constraint rejected the write (e.g. overlap), "forbidden" = caller isn't authorized to act on this request right now */
  reason?: "not_found" | "conflict" | "db_error" | "forbidden";
  /** Set on "db_error"/"forbidden" — a message safe to show the user directly. */
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
  // `level` is team_leads.approval_order's actual stored value (see
  // resolveApprovalChain), so this equality check stays correct even if
  // other levels are added/removed/reordered elsewhere — it's never
  // re-derived from array position.
  const isAssignedAtCurrentLevel =
    chain.type === "chain" && chain.levels.some((l) => l.level === current.current_level && l.approver.id === actor.id);
  const isAuthorized =
    actor.role === "admin" ||
    (chain.type === "override" ? chain.levels.some((l) => l.approver.id === actor.id) : isAssignedAtCurrentLevel);

  if (!isAuthorized) {
    return { ok: false, reason: "forbidden", message: "ยังไม่ถึงลำดับอนุมัติของคุณ" };
  }

  // An admin who happens to also be the chain's assigned approver at the
  // current level (e.g. explicitly set as ลำดับ 1) still hands off to the
  // next level like anyone else — admin's instant-finalize power is for
  // acting outside/out-of-turn on the chain, not for skipping levels they
  // were deliberately placed in.
  const nextLevel = chain.type === "chain" ? chain.levels.find((l) => l.level > current.current_level) : undefined;
  const isLastLevel = chain.type === "override" || (actor.role === "admin" && !isAssignedAtCurrentLevel) || !nextLevel;

  if (decision === "approved" && !isLastLevel && nextLevel) {
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ current_level: nextLevel.level, approver_id: actor.id, approver_note: note })
      .eq("id", id)
      .eq("status", "pending")
      .eq("current_level", current.current_level)
      .select("*")
      .maybeSingle();

    if (error) return { ok: false, reason: "db_error", message: safeDbErrorMessage(error) };
    if (!data) return { ok: false, reason: "conflict" };

    // The status-change trigger only logs when `status` itself changes, and
    // (unlike the trigger, which is SECURITY DEFINER) the caller's own
    // session has no RLS policy allowing an insert into leave_request_logs
    // — route this one through the admin client instead.
    const admin = createAdminSupabaseClient();
    await admin.from("leave_request_logs").insert({
      request_id: id,
      actor_id: actor.id,
      from_status: "pending",
      to_status: "pending",
      note: note ? `อนุมัติลำดับที่ ${current.current_level}: ${note}` : `อนุมัติลำดับที่ ${current.current_level}`,
      level: current.current_level,
    });

    // Live SMTP send — don't make the actor wait on it before their click
    // gets a response; waitUntil finishes it in the background instead.
    waitUntil(
      (async () => {
        const [{ data: requester }, { data: leaveType }] = await Promise.all([
          supabase.from("users").select("email").eq("id", current.user_id).single(),
          supabase.from("leave_types").select("name").eq("id", current.leave_type_id).single(),
        ]);
        if (requester) {
          await sendOrQueueEmail(
            admin,
            {
              type: "new_request",
              payload: {
                approverEmail: nextLevel.approver.email,
                requesterEmail: requester.email,
                requestNo: current.request_no,
                leaveTypeName: leaveType?.name ?? "",
                startDate: current.start_date,
                endDate: current.end_date,
                totalDays: current.total_days,
                requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${current.request_no}`,
              },
            },
            nextLevel.approver.email
          );
        }
      })()
    );

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
    // A returned request restarts the chain at its (current) lowest level —
    // resubmission re-resolves this anyway (see submit/route.ts), but this
    // keeps a 'returned' row's stored level from pointing at whichever
    // approver it happened to be sitting with when it was returned.
    currentLevel: decision === "returned" ? (chain.type === "chain" ? (chain.levels[0]?.level ?? 1) : 1) : undefined,
  });

  if (!result.ok) return result;

  const requestRow = result.request!;
  waitUntil(
    (async () => {
      const [{ data: requester }, { data: leaveType }] = await Promise.all([
        supabase.from("users").select("email").eq("id", requestRow.user_id).single(),
        supabase.from("leave_types").select("name").eq("id", requestRow.leave_type_id).single(),
      ]);

      if (requester) {
        await sendOrQueueEmail(
          createAdminSupabaseClient(),
          {
            type: "decision",
            payload: {
              requesterEmail: requester.email,
              requestNo: requestRow.request_no,
              leaveTypeName: leaveType?.name ?? "",
              startDate: requestRow.start_date,
              endDate: requestRow.end_date,
              decision,
              approverEmail: actor.email,
              approverNote: note,
              requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${requestRow.request_no}`,
            },
          },
          requester.email
        );
      }
    })()
  );

  return result;
}

/**
 * Admin-only escape hatch for when the assigned approver at the current
 * level is unavailable (out sick, left the company, etc.) — advances the
 * chain past them without requiring their action, same as if they'd
 * approved, but logged distinctly as an admin skip rather than a genuine
 * approval. If there's no next level (last level, or an override chain's
 * single approver), skipping finalizes the request as approved.
 */
export async function skipCurrentApprover({
  supabase,
  id,
  actor,
  note,
}: {
  supabase: SupabaseClient<Database>;
  id: string;
  actor: AppUser;
  note: string | null;
}): Promise<TransitionResult> {
  if (actor.role !== "admin") {
    return { ok: false, reason: "forbidden", message: "เฉพาะ admin เท่านั้นที่ข้ามผู้อนุมัติได้" };
  }

  const { data: current } = await supabase
    .from("leave_requests")
    .select("id, status, team_id, user_id, current_level, leave_type_id, start_date, end_date, request_no, total_days")
    .eq("id", id)
    .maybeSingle();

  if (!current) return { ok: false, reason: "not_found" };
  if (current.status !== "pending") return { ok: false, reason: "conflict" };

  const chain = await resolveApprovalChain({ userId: current.user_id, teamId: current.team_id });
  const nextLevel = chain.type === "chain" ? chain.levels.find((l) => l.level > current.current_level) : undefined;
  const skipNote = note ? `ข้ามผู้อนุมัติโดยแอดมิน: ${note}` : "ข้ามผู้อนุมัติโดยแอดมิน";

  if (nextLevel) {
    const { data, error } = await supabase
      .from("leave_requests")
      .update({ current_level: nextLevel.level, approver_id: actor.id, approver_note: skipNote })
      .eq("id", id)
      .eq("status", "pending")
      .eq("current_level", current.current_level)
      .select("*")
      .maybeSingle();

    if (error) return { ok: false, reason: "db_error", message: safeDbErrorMessage(error) };
    if (!data) return { ok: false, reason: "conflict" };

    // Status stays 'pending' throughout, so the auto-log trigger (which only
    // fires on a status change) won't record this step — insert it directly,
    // same as the normal intermediate-approval path above.
    const admin = createAdminSupabaseClient();
    await admin.from("leave_request_logs").insert({
      request_id: id,
      actor_id: actor.id,
      from_status: "pending",
      to_status: "pending",
      note: skipNote,
      level: current.current_level,
    });

    // Live SMTP send — don't make the actor wait on it before their click
    // gets a response; waitUntil finishes it in the background instead.
    waitUntil(
      (async () => {
        const [{ data: requester }, { data: leaveType }] = await Promise.all([
          supabase.from("users").select("email").eq("id", current.user_id).single(),
          supabase.from("leave_types").select("name").eq("id", current.leave_type_id).single(),
        ]);
        if (requester) {
          await sendOrQueueEmail(
            admin,
            {
              type: "new_request",
              payload: {
                approverEmail: nextLevel.approver.email,
                requesterEmail: requester.email,
                requestNo: current.request_no,
                leaveTypeName: leaveType?.name ?? "",
                startDate: current.start_date,
                endDate: current.end_date,
                totalDays: current.total_days,
                requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${current.request_no}`,
              },
            },
            nextLevel.approver.email
          );
        }
      })()
    );

    return { ok: true, request: data };
  }

  const result = await transitionLeaveRequest({
    supabase,
    id,
    fromStatuses: ["pending"],
    toStatus: "approved",
    approverId: actor.id,
    approverNote: skipNote,
  });

  if (!result.ok) return result;

  const requestRow = result.request!;
  waitUntil(
    (async () => {
      const { data: requester } = await supabase.from("users").select("email").eq("id", requestRow.user_id).single();
      const { data: leaveType } = await supabase
        .from("leave_types")
        .select("name")
        .eq("id", requestRow.leave_type_id)
        .single();

      if (requester) {
        await sendOrQueueEmail(
          createAdminSupabaseClient(),
          {
            type: "decision",
            payload: {
              requesterEmail: requester.email,
              requestNo: requestRow.request_no,
              leaveTypeName: leaveType?.name ?? "",
              startDate: requestRow.start_date,
              endDate: requestRow.end_date,
              decision: "approved",
              approverEmail: actor.email,
              approverNote: skipNote,
              requestUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${requestRow.request_no}`,
            },
          },
          requester.email
        );
      }
    })()
  );

  return result;
}
