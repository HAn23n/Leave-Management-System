import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { leaveRequestInputSchema } from "@/lib/validation/leave-request";
import { rateLimitResponse } from "@/lib/rate-limit";
import { safeDbErrorMessage } from "@/lib/db-error";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  // Approvers only review/approve their team's documents — they never edit
  // their own leave requests, even an old draft from before they held the role.
  if (appUser.role === "approver") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveRequestInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  const { data: leaveType } = await supabase
    .from("leave_types")
    .select("require_reason")
    .eq("id", parsed.data.leave_type_id)
    .maybeSingle();
  if (leaveType?.require_reason && !parsed.data.reason.trim()) {
    return NextResponse.json(
      { error: "invalid_input", message: "ประเภทการลานี้ต้องระบุเหตุผล" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      leave_type_id: parsed.data.leave_type_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      start_period: parsed.data.start_period,
      end_period: parsed.data.end_period,
      reason: parsed.data.reason,
    })
    .eq("id", params.id)
    .eq("user_id", appUser.id)
    .in("status", ["draft", "returned"])
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: safeDbErrorMessage(error) }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_editable" }, { status: 409 });
  }

  return NextResponse.json({ request: data });
}
