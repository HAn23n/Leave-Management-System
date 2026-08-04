import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReportQuery, loadReportLookups } from "@/lib/reports";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, PERIOD_LABEL_TH } from "@/lib/status";
import { rateLimitResponse } from "@/lib/rate-limit";
import { safeDbErrorMessage } from "@/lib/db-error";

export async function GET(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limited = rateLimitResponse(appUser.id);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const supabase = createServerSupabaseClient();

  const { data: requests, error } = await buildReportQuery(supabase, {
    userId: searchParams.get("user_id") ?? undefined,
    teamId: searchParams.get("team_id") ?? undefined,
    leaveTypeId: searchParams.get("leave_type_id") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  if (error) {
    return NextResponse.json({ error: safeDbErrorMessage(error) }, { status: 400 });
  }

  const rows = requests ?? [];
  const { userMap, leaveTypeMap, teamMap } = await loadReportLookups(supabase, rows);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ระบบบันทึกการลา";
  const sheet = workbook.addWorksheet("รายงานการลา");

  sheet.columns = [
    { header: "เลขที่เอกสาร", key: "request_no", width: 16 },
    { header: "ชื่อพนักงาน", key: "employee", width: 22 },
    { header: "ทีม", key: "team", width: 14 },
    { header: "ประเภทการลา", key: "leave_type", width: 16 },
    { header: "วันที่เริ่ม", key: "start_date", width: 14 },
    { header: "ช่วงเวลาเริ่ม", key: "start_period", width: 14 },
    { header: "วันที่สิ้นสุด", key: "end_date", width: 14 },
    { header: "ช่วงเวลาสิ้นสุด", key: "end_period", width: 14 },
    { header: "จำนวนวัน", key: "total_days", width: 10 },
    { header: "สถานะ", key: "status", width: 12 },
    { header: "ผู้อนุมัติ", key: "approver", width: 22 },
    { header: "หมายเหตุ", key: "note", width: 24 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FF1F2937" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  sheet.getRow(1).border = { bottom: { style: "thin", color: { argb: "FFD1D5DB" } } };

  for (const r of rows) {
    sheet.addRow({
      request_no: r.request_no ?? "",
      employee: userMap.get(r.user_id) ?? "",
      team: teamMap.get(r.team_id) ?? "",
      leave_type: leaveTypeMap.get(r.leave_type_id) ?? "",
      start_date: formatThaiDate(r.start_date, "iso-be"),
      start_period: PERIOD_LABEL_TH[r.start_period],
      end_date: formatThaiDate(r.end_date, "iso-be"),
      end_period: PERIOD_LABEL_TH[r.end_period],
      total_days: r.total_days ?? "",
      status: STATUS_LABEL_TH[r.status],
      approver: r.approver_id ? userMap.get(r.approver_id) ?? "" : "",
      note: r.approver_note ?? "",
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `leave-report-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
