import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STATUS_LABEL_TH } from "@/lib/status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDateField } from "@/components/calendar-date-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Download, Search } from "lucide-react";
import type { LeaveStatus } from "@/lib/supabase/types";

interface ReportSearchParams {
  user_id?: string;
  team_id?: string;
  leave_type_id?: string;
  status?: string;
  from?: string;
  to?: string;
}

export default async function ReportsPage({ searchParams }: { searchParams: ReportSearchParams }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();
  const isApprover = appUser.role === "approver" || appUser.role === "admin";

  const [{ data: leaveTypes }, { data: teams }, { data: teamUsers }, { data: holidayRows }] = await Promise.all([
    supabase.from("leave_types").select("id, name"),
    appUser.role === "admin" ? supabase.from("teams").select("id, name") : Promise.resolve({ data: null }),
    isApprover ? supabase.from("users").select("id, full_name") : Promise.resolve({ data: null }),
    supabase.from("holidays").select("holiday_date, name"),
  ]);
  const holidayMap = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));

  // Reports are mostly pulled for payroll/HR purposes, where "approved" is
  // the status that actually matters — default the filter (and the Excel
  // export it drives) to it instead of "ทุกสถานะ" until the admin changes it.
  const statusDefault = searchParams.status ?? "approved";

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && value !== "all") query.set(key, String(value));
  }
  if (!searchParams.status) {
    query.set("status", "approved");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">รายงานสรุป</h1>

      <form method="get" className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
                    {u.full_name}
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

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ตั้งแต่วันที่</Label>
          <CalendarDateField name="from" defaultValue={searchParams.from} holidays={holidayMap} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">ถึงวันที่</Label>
          <CalendarDateField name="to" defaultValue={searchParams.to} holidays={holidayMap} />
        </div>

        <Button type="submit" size="sm" className="col-span-2 md:col-span-4">
          <Search className="h-4 w-4" />
          กรอง
        </Button>
      </form>

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-6 text-center">
        <Button asChild>
          <a href={`/api/reports/export-excel?${query.toString()}`}>
            <Download className="h-4 w-4" />
            ดาวน์โหลด Excel
          </a>
        </Button>
      </div>
    </main>
  );
}
