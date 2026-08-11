import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { consumeApprovalToken, markApprovalTokenUsed } from "@/lib/approval-tokens";
import { decideOnPendingRequest } from "@/lib/leave-requests";
import { rateLimitResponse } from "@/lib/rate-limit";

// Unauthenticated — reached from the one-click link in the approval email,
// not a logged-in session. The token itself (see lib/approval-tokens.ts) is
// what proves the caller is the approver it was minted for; every other
// authorization/chain rule is enforced by decideOnPendingRequest exactly the
// same as the session-based routes.
export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const limited = rateLimitResponse(`approval-token:${ip}`);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const decision = body?.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }
  const note: string | null = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;

  const token = await consumeApprovalToken(params.token);
  if (!token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 410 });
  }

  const admin = createAdminSupabaseClient();
  const { data: approver } = await admin.from("users").select("*").eq("id", token.approverId).maybeSingle();
  if (!approver || !approver.is_active) {
    return NextResponse.json({ error: "invalid_token" }, { status: 410 });
  }

  const result = await decideOnPendingRequest({
    supabase: admin,
    id: token.requestId,
    actor: approver,
    decision,
    note,
  });

  if (result.ok) {
    await markApprovalTokenUsed(token.id);
  }

  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "forbidden"
          ? 403
          : result.reason === "db_error"
            ? 400
            : 409;
    return NextResponse.json({ error: result.reason, message: result.message }, { status });
  }

  return NextResponse.json({ request: result.request });
}
