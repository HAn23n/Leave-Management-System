import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { leaveRequestInputSchema } from "@/lib/validation/leave-request";
import { rateLimitResponse } from "@/lib/rate-limit";
import { safeDbErrorMessage } from "@/lib/db-error";

export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  // Approvers only review/approve their team's documents — they never file
  // their own leave. The UI already routes them away from this form; this
  // is the same rule enforced at the write path, so a direct API call can't
  // bypass it.
  if (appUser.role === "approver") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = leaveRequestInputSchema.safeParse(body);
  if (!parsed.success || !parsed.data.team_id) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // A request may only be filed under a team the requester actually belongs
  // to — RLS's leave_requests_insert_own enforces this too, but checking
  // here first gives a clean error instead of a raw DB rejection.
  const { data: membership } = await supabase
    .from("user_teams")
    .select("team_id")
    .eq("user_id", appUser.id)
    .eq("team_id", parsed.data.team_id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "invalid_input", message: "คุณไม่ได้อยู่ในทีมนี้" }, { status: 400 });
  }

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
    .insert({
      user_id: appUser.id,
      team_id: parsed.data.team_id,
      leave_type_id: parsed.data.leave_type_id,
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date,
      start_period: parsed.data.start_period,
      end_period: parsed.data.end_period,
      reason: parsed.data.reason,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: safeDbErrorMessage(error) }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
