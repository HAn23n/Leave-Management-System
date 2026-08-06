import { NextResponse, type NextRequest } from "next/server";
import { format } from "date-fns";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { notifyCheckInReminder, notifyCheckOutReminder } from "@/lib/email";
import { nowInBangkok, todayIso } from "@/lib/date";

/**
 * Runs every few minutes (see vercel.json) and fires each reminder at most
 * once per day, the first time it observes Bangkok clock time at/after the
 * admin-configured reminder time (attendance_settings) — last_*_reminder_date
 * is the same-day dedupe guard, since this checks far more often than once a
 * day. Reminders are a recurring nudge, not a one-off event to lose, so a
 * transient send failure here is just retried on the next run rather than
 * queued in email_outbox.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: settings } = await admin.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
  if (!settings) {
    return NextResponse.json({ error: "no_settings" }, { status: 500 });
  }

  const today = todayIso();
  const nowTime = format(nowInBangkok(), "HH:mm:ss");

  let checkInSent = 0;
  let checkOutSent = 0;

  if (nowTime >= settings.check_in_reminder_time && settings.last_check_in_reminder_date !== today) {
    const [{ data: activeUsers }, { data: checkedInToday }, { data: onLeaveToday }] = await Promise.all([
      admin.from("users").select("id, email").eq("is_active", true),
      admin.from("attendance_logs").select("user_id").eq("work_date", today).not("check_in_at", "is", null),
      admin
        .from("leave_requests")
        .select("user_id")
        .eq("status", "approved")
        .lte("start_date", today)
        .gte("end_date", today),
    ]);

    const checkedInSet = new Set((checkedInToday ?? []).map((r) => r.user_id));
    const onLeaveSet = new Set((onLeaveToday ?? []).map((r) => r.user_id));
    const targets = (activeUsers ?? []).filter((u) => !checkedInSet.has(u.id) && !onLeaveSet.has(u.id));

    await Promise.all(targets.map((u) => notifyCheckInReminder(u.email).catch(() => {})));
    checkInSent = targets.length;

    await admin.from("attendance_settings").update({ last_check_in_reminder_date: today }).eq("id", 1);
  }

  if (nowTime >= settings.check_out_reminder_time && settings.last_check_out_reminder_date !== today) {
    const { data: activeToday } = await admin
      .from("attendance_logs")
      .select("user_id")
      .eq("work_date", today)
      .not("check_in_at", "is", null)
      .is("check_out_at", null);

    const userIds = (activeToday ?? []).map((r) => r.user_id);
    if (userIds.length > 0) {
      const { data: users } = await admin.from("users").select("id, email").in("id", userIds).eq("is_active", true);
      await Promise.all((users ?? []).map((u) => notifyCheckOutReminder(u.email).catch(() => {})));
      checkOutSent = (users ?? []).length;
    }

    await admin.from("attendance_settings").update({ last_check_out_reminder_date: today }).eq("id", 1);
  }

  return NextResponse.json({ checkInSent, checkOutSent });
}
