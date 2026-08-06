import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/date";
import { rateLimitResponse } from "@/lib/rate-limit";
import { safeDbErrorMessage } from "@/lib/db-error";

export async function POST() {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const supabase = createServerSupabaseClient();
  const workDate = todayIso();

  const { data: existing } = await supabase
    .from("attendance_logs")
    .select("id, check_in_at, check_out_at")
    .eq("user_id", appUser.id)
    .eq("work_date", workDate)
    .maybeSingle();

  if (!existing?.check_in_at) {
    return NextResponse.json({ error: "not_checked_in" }, { status: 409 });
  }
  if (existing.check_out_at) {
    return NextResponse.json({ error: "already_checked_out" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({ check_out_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: safeDbErrorMessage(error) }, { status: 400 });
  }

  return NextResponse.json({ attendance: data });
}
