import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangeFields } from "@/components/date-range-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Download } from "lucide-react";
import type { AppUser, LeaveStatus } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import { formatThaiDate } from "@/lib/date";
import { displayName } from "@/lib/users";
import { buildReportQuery, loadReportLookups } from "@/lib/reports";

interface LeaveReportSearchParams {
  user_id?: string;
  team_id?: string;
  leave_type_id?: string;
  status?: string;
  from?: string;
  to?: string;
}

export async function LeaveReportTab({
  appUser,
  supabase,
  searchParams,
}: {
  appUser: AppUser;
  supabase: SupabaseClient<Database>;
  searchParams: LeaveReportSearchParams;
}) {
  const isApprover = appUser.role === "approver" || appUser.role === "admin";

  const [{ data: leaveTypes }, { data: teams }, { data: teamUsers }, { data: holidayRows }] = await Promise.all([
    supabase.from("leave_types").select("id, name"),
    appUser.role === "admin" ? supabase.from("teams").select("id, name") : Promise.resolve({ data: null }),
    isApprover ? supabase.from("users").select("id, email, nickname") : Promise.resolve({ data: null }),
    supabase.from("holidays").select("holiday_date, name"),
  ]);
  const holidayMap = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));

  // Reports are mostly pulled for payroll/HR purposes, where "approved" is
  // the status that actually matters — default the filter (and the Excel
  // export it drives) to it instead of "ทุกสถานะ" until the admin changes it.
  const statusDefault = searchParams.status ?? "approved";

  const { data: previewRows } = await buildReportQuery(supabase, {
    userId: isApprover ? searchParams.user_id : appUser.id,
    teamId: searchParams.team_id,
    leaveTypeId: searchParams.leave_type_id,
    status: statusDefault,
    from: searchParams.from,
    to: searchParams.to,
  });
  const rows = previewRows ?? [];
  const { userMap, leaveTypeMap } = await loadReportLookups(supabase, rows);

  return (
    <>
      {/* One form, two submit buttons: the default one reloads this page
          (refreshing the on-screen preview below), the Excel one overrides
          its target via formAction. Both always read the same in-DOM field
          values at click time, so preview and export can never go stale
          relative to each other. */}
      <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <input type="hidden" name="tab" value="leave" />
        {isApprover && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">พนักงาน</Label>
            <Select name="user_id" defaultValue={searchParams.user_id ?? "all"}>
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
            <Select name="team_id" defaultValue={searchParams.team_id ?? "all"}>
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ประเภทการลา</Label>
          <Select name="leave_type_id" defaultValue={searchParams.leave_type_id ?? "all"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกประเภท</SelectItem>
              {(leaveTypes ?? []).map((lt) => (
                <SelectItem key={lt.id} value={lt.id}>
                  {lt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">สถานะ</Label>
          <Select name="status" defaultValue={statusDefault}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกสถานะ</SelectItem>
              {(Object.keys(STATUS_LABEL_TH) as LeaveStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL_TH[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DateRangeFields
          fromName="from"
          toName="to"
          fromDefault={searchParams.from}
          toDefault={searchParams.to}
          holidays={holidayMap}
        />

        <div className="col-span-2 flex gap-2 md:col-span-4">
          <Button type="submit" variant="outline" className="flex-1">
            แสดงตัวอย่าง
          </Button>
          <Button type="submit" formAction="/api/reports/export-excel" className="flex-1">
            <Download className="h-4 w-4" />
            ดาวน์โหลด Excel
          </Button>
        </div>
      </form>

      <Card>
        <CardContent className="flex flex-col gap-2 p-3">
          <p className="px-1 text-xs text-muted-foreground">
            พบ {rows.length} รายการ — ตัวอย่างข้อมูลก่อนดาวน์โหลด
          </p>
          {rows.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">พนักงาน</th>
                    <th className="px-2 py-2 font-medium">ประเภท</th>
                    <th className="px-2 py-2 font-medium">วันที่</th>
                    <th className="px-2 py-2 font-medium">จำนวนวัน</th>
                    <th className="px-2 py-2 font-medium">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-2 py-2 text-foreground">{userMap.get(r.user_id) ?? "-"}</td>
                      <td className="px-2 py-2 text-foreground">{leaveTypeMap.get(r.leave_type_id) ?? "-"}</td>
                      <td className="px-2 py-2 text-foreground">
                        {formatThaiDate(r.start_date)} - {formatThaiDate(r.end_date)}
                      </td>
                      <td className="px-2 py-2 text-foreground">{r.total_days ?? "-"}</td>
                      <td className="px-2 py-2">
                        <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL_TH[r.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
