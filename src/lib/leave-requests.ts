import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeaveRequest, LeaveStatus } from "@/lib/supabase/types";

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
  /** "not_found" = no row with that id/scope, "conflict" = optimistic-lock mismatch (status already moved) */
  reason?: "not_found" | "conflict";
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
    throw error;
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
