import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { transitionLeaveRequest } from "@/lib/leave-requests";
import { resolveApprovers, firstApprovalLevel } from "@/lib/approval-chain";
import { sendOrQueueEmail } from "@/lib/email-outbox";
import { rateLimitResponse } from "@/lib/rate-limit";

// draft/returned -> pending, owner only. Notifies the resolved approver(s).
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  // Approvers only review/approve their team's documents — they never
  // submit their own leave for approval, even an old draft/returned one
  // from before they held the role.
  if (appUser.role === "approver") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leave_requests")
    .select("user_id, team_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const startLevel = await firstApprovalLevel({ userId: existing.user_id, teamId: existing.team_id });

  const result = await transitionLeaveRequest({
    supabase,
    id: params.id,
    fromStatuses: ["draft", "returned"],
    toStatus: "pending",
    // Clear any decision left over from a previous return/rejection — a fresh
    // submission has no approver or note yet, and leaving the old ones in
    // place would show a stale approver/note on what is now a pending request.
    approverId: null,
    approverNote: null,
    // Every (re)submission restarts the approval chain at its lowest level
    // (not hardcoded 1 — the team's chain may not start at 1 if an earlier
    // level was ever removed).
    currentLevel: startLevel,
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "db_error" ? 400 : 409;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  const requestRow = result.request!;
  if (requestRow.user_id !== appUser.id) {
    // Shouldn't happen given RLS, but never send a misleading notification if it does.
    return NextResponse.json({ request: requestRow });
  }

  const [approvers, { data: leaveType }] = await Promise.all([
    resolveApprovers({ userId: appUser.id, teamId: requestRow.team_id }),
    supabase.from("leave_types").select("name").eq("id", requestRow.leave_type_id).single(),
  ]);

  const requestUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/leave-requests/${requestRow.request_no}`;
  const admin = createAdminSupabaseClient();
  await Promise.all(
    approvers.map((approver) =>
      sendOrQueueEmail(
        admin,
        {
          type: "new_request",
          payload: {
            approverEmail: approver.email,
            requesterEmail: appUser.email,
            requestNo: requestRow.request_no,
            leaveTypeName: leaveType?.name ?? "",
            startDate: requestRow.start_date,
            endDate: requestRow.end_date,
            totalDays: requestRow.total_days,
            requestUrl,
          },
        },
        approver.email
      )
    )
  );

  return NextResponse.json({ request: requestRow });
}
