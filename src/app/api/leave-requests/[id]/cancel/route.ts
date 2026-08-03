import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { transitionLeaveRequest } from "@/lib/leave-requests";
import type { LeaveStatus } from "@/lib/supabase/types";
import { rateLimitResponse } from "@/lib/rate-limit";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const supabase = createServerSupabaseClient();

  const { data: existing } = await supabase
    .from("leave_requests")
    .select("id, user_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const isOwner = existing.user_id === appUser.id;
  const isPrivileged = appUser.role === "approver" || appUser.role === "admin";

  if (!isOwner && !isPrivileged) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // The owner may only withdraw before a decision is made; an approver/admin
  // (within their RLS-enforced scope) may also cancel an already-approved leave.
  const fromStatuses: LeaveStatus[] = isPrivileged
    ? ["draft", "pending", "approved", "returned"]
    : ["draft", "pending"];

  const result = await transitionLeaveRequest({
    supabase,
    id: params.id,
    fromStatuses,
    toStatus: "cancelled",
  });

  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ request: result.request });
}
