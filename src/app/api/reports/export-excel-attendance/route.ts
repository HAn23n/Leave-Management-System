import { NextResponse, type NextRequest } from "next/server";
import { startOfMonth, endOfMonth, format } from "date-fns";
import ExcelJS from "exceljs";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatThaiDate, nowInBangkok } from "@/lib/date";
import { displayName } from "@/lib/users";
import { rateLimitResponse } from "@/lib/rate-limit";
import { safeDbErrorMessage } from "@/lib/db-error";
import {
  buildAttendanceQuery,
  expectedWorkDates,
  summarizeAttendance,
  groupDailyRows,
  loadAttendanceSettings,
  resolveAttendanceRoster,
} from "@/lib/attendance-reports";

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export async function GET(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const supabase = createServerSupabaseClient();
  const isApprover = appUser.role === "approver" || appUser.role === "admin";

  const now = nowInBangkok();
  const from = searchParams.get("from") || format(startOfMonth(now), "yyyy-MM-dd");
  const to = searchParams.get("to") || format(endOfMonth(now), "yyyy-MM-dd");
  // A plain employee can only ever export their own records — never lets the
  // user_id/team_id query params widen that, even though RLS already
  // enforces it at the DB level too (mirrors export-excel/route.ts).
  const userId = isApprover ? (searchParams.get("user_id") ?? undefined) : appUser.id;
  const teamId = isApprover ? (searchParams.get("team_id") ?? undefined) : undefined;

  const [{ data: logRows, error }, { data: teamUsers }, { data: holidayRows }, settings] = await Promise.all([
    buildAttendanceQuery(supabase, { userId, teamId, from, to }),
    isApprover ? supabase.from("users").select("id, email, nickname") : Promise.resolve({ data: null }),
    supabase.from("holidays").select("holiday_date"),
    loadAttendanceSettings(supabase),
  ]);

  if (error) {
    return NextResponse.json({ error: safeDbErrorMessage(error) }, { status: 400 });
  }

  const logs = logRows ?? [];
  const roster = await resolveAttendanceRoster(supabase, appUser, isApprover, teamUsers, userId, teamId);
  const userMap = new Map(roster.map((u) => [u.id, displayName(u)]));
  const expected = expectedWorkDates(from, to, (holidayRows ?? []).map((h) => h.holiday_date));
  const summary = summarizeAttendance(
    logs,
    roster.map((u) => u.id),
    settings,
    expected
  );
  const dailyByUser = groupDailyRows(logs, settings.break_hours);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ระบบบันทึกการลา";

  const summarySheet = workbook.addWorksheet("สรุป");
  summarySheet.columns = [
    { header: "พนักงาน", key: "employee", width: 26 },
    { header: "วันมาทำงาน", key: "days_worked", width: 12 },
    { header: "ชั่วโมงรวม", key: "total_hours", width: 12 },
    { header: "เช็คอินสาย", key: "late_count", width: 12 },
    { header: "เช็คเอาท์ก่อนเวลา", key: "early_count", width: 16 },
    { header: "ขาดลงเวลา", key: "missing_count", width: 12 },
  ];
  summarySheet.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  summarySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

  for (const s of summary) {
    summarySheet.addRow({
      employee: userMap.get(s.userId) ?? "",
      days_worked: s.daysWorked,
      total_hours: Number(s.totalHours.toFixed(1)),
      late_count: s.lateCount,
      early_count: s.earlyLeaveCount,
      missing_count: s.missingCount,
    });
  }

  const dailySheet = workbook.addWorksheet("รายวัน");
  dailySheet.columns = [
    { header: "พนักงาน", key: "employee", width: 26 },
    { header: "วันที่", key: "work_date", width: 14 },
    { header: "เช็คอิน", key: "check_in", width: 10 },
    { header: "เช็คเอาท์", key: "check_out", width: 10 },
    { header: "ชั่วโมง", key: "hours", width: 10 },
  ];
  dailySheet.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  dailySheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };

  for (const u of roster) {
    const days = dailyByUser.get(u.id) ?? [];
    for (const d of days) {
      dailySheet.addRow({
        employee: userMap.get(u.id) ?? "",
        work_date: formatThaiDate(d.workDate, "iso-be"),
        check_in: formatTime(d.checkInAt),
        check_out: formatTime(d.checkOutAt),
        hours: d.hours != null ? Number(d.hours.toFixed(1)) : "",
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `attendance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
