import "server-only";

// Resend wiring lands in a later stage — these are the call sites routes use now.
// Failures here must never block the underlying status transition, so callers
// should fire-and-catch (see usage in the API routes).

export async function notifyNewLeaveRequest(_params: {
  approverEmail: string;
  approverName: string;
  requesterName: string;
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number | null;
  requestUrl: string;
}): Promise<void> {
  // TODO(stage 10): send via Resend
}

export async function notifyLeaveDecision(_params: {
  requesterEmail: string;
  requesterName: string;
  requestNo: string | null;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  decision: "approved" | "rejected" | "returned";
  approverName: string;
  approverNote?: string | null;
  requestUrl: string;
}): Promise<void> {
  // TODO(stage 10): send via Resend
}
