import { startOfMonth, endOfMonth, format } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFields } from "@/components/date-range-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import type { AppUser, Database } from "@/lib/supabase/types";
import { formatThaiDate, nowInBangkok } from "@/lib/date";
import { displayName } from "@/lib/users";
import {
  buildAttendanceQuery,
  expectedWorkDates,
  summarizeAttendance,
  groupDailyRows,
  loadAttendanceSettings,
  resolveAttendanceRoster,
} from "@/lib/attendance-reports";

interface AttendanceReportSearchParams {
  user_id?: string;
  team_id?: string;
  from?: string;
  to?: string;
}

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
}

export async function AttendanceReportTab({
  appUser,
  supabase,
  searchParams,
}: {
  appUser: AppUser;
  supabase: SupabaseClient<Database>;
  searchParams: AttendanceReportSearchParams;
}) {
  const isApprover = appUser.role === "approver" || appUser.role === "admin";
  const now = nowInBangkok();
  const from = searchParams.from ?? format(startOfMonth(now), "yyyy-MM-dd");
  const to = searchParams.to ?? format(endOfMonth(now), "yyyy-MM-dd");

  const [{ data: teams }, { data: teamUsers }, { data: holidayRows }, settings] = await Promise.all([
    appUser.role === "admin" ? supabase.from("teams").select("id, name") : Promise.resolve({ data: null }),
    isApprover ? supabase.from("users").select("id, email, nickname") : Promise.resolve({ data: null }),
    supabase.from("holidays").select("holiday_date, name"),
    loadAttendanceSettings(supabase),
  ]);
  const holidayMap = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));

  const userId = isApprover ? searchParams.user_id : appUser.id;
  const teamId = isApprover ? searchParams.team_id : undefined;

  const roster = await resolveAttendanceRoster(supabase, appUser, isApprover, teamUsers, userId, teamId);
  const userMap = new Map(roster.map((u) => [u.id, displayName(u)]));

  const { data: logRows } = await buildAttendanceQuery(supabase, { userId, teamId, from, to });
  const logs = logRows ?? [];

  const expected = expectedWorkDates(from, to, Array.from(holidayMap.keys()));
  const rosterIds = roster.map((u) => u.id);
  const summary = summarizeAttendance(logs, rosterIds, settings, expected);
  const dailyByUser = groupDailyRows(logs, settings.break_hours);

  return (
    <>
      <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <input type="hidden" name="tab" value="attendance" />
        {isApprover && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">พนักงาน</Label>
            <Select name="user_id" defaultValue={userId ?? "all"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกคน</SelectItem>
                {(teamUsers ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {displayName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {appUser.role === "admin" && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">ทีม</Label>
            <Select name="team_id" defaultValue={teamId ?? "all"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกทีม</SelectItem>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DateRangeFields fromName="from" toName="to" fromDefault={from} toDefault={to} holidays={holidayMap} />

        <div className="col-span-2 flex gap-2 md:col-span-4">
          <Button type="submit" variant="outline" className="flex-1">
            แสดงตัวอย่าง
          </Button>
          <Button type="submit" formAction="/api/reports/export-excel-attendance" className="flex-1">
            <Download className="h-4 w-4" />
            ดาวน์โหลด Excel
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>สรุปรายคน</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-3 pt-0">
          {summary.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">พนักงาน</th>
                    <th className="px-2 py-2 font-medium">วันมาทำงาน</th>
                    <th className="px-2 py-2 font-medium">ชั่วโมงรวม</th>
                    <th className="px-2 py-2 font-medium">เช็คอินสาย</th>
                    <th className="px-2 py-2 font-medium">เช็คเอาท์ก่อนเวลา</th>
                    <th className="px-2 py-2 font-medium">ขาดลงเวลา</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s) => (
                    <tr key={s.userId} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2 text-foreground">{userMap.get(s.userId) ?? "-"}</td>
                      <td className="px-2 py-2 text-foreground">{s.daysWorked} วัน</td>
                      <td className="px-2 py-2 text-foreground">{s.totalHours.toFixed(1)} ชม.</td>
                      <td className="px-2 py-2 text-foreground">{s.lateCount}</td>
                      <td className="px-2 py-2 text-foreground">{s.earlyLeaveCount}</td>
                      <td className="px-2 py-2 text-foreground">{s.missingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {roster.map((u) => {
          const days = dailyByUser.get(u.id) ?? [];
          if (days.length === 0) return null;
          return (
            <Card key={u.id}>
              <CardHeader>
                <CardTitle className="text-sm">{displayName(u)}</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-2 py-2 font-medium">วันที่</th>
                        <th className="px-2 py-2 font-medium">เช็คอิน</th>
                        <th className="px-2 py-2 font-medium">เช็คเอาท์</th>
                        <th className="px-2 py-2 font-medium">ชั่วโมง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => (
                        <tr key={d.workDate} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-2 text-foreground">{formatThaiDate(d.workDate)}</td>
                          <td className="px-2 py-2 text-foreground">{formatTime(d.checkInAt)}</td>
                          <td className="px-2 py-2 text-foreground">{formatTime(d.checkOutAt)}</td>
                          <td className="px-2 py-2 text-foreground">{d.hours != null ? `${d.hours.toFixed(1)} ชม.` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
