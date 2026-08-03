import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildReportQuery, loadReportLookups } from "@/lib/reports";
import { formatThaiDate } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_BADGE_VARIANT } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const filters = {
    userId: searchParams.user_id,
    teamId: searchParams.team_id,
    leaveTypeId: searchParams.leave_type_id,
    status: searchParams.status,
    from: searchParams.from,
    to: searchParams.to,
  };

  const [{ data: requests }, { data: leaveTypes }, { data: teams }, { data: teamUsers }] = await Promise.all([
    buildReportQuery(supabase, filters),
    supabase.from("leave_types").select("id, name"),
    appUser.role === "admin" ? supabase.from("teams").select("id, name") : Promise.resolve({ data: null }),
    isApprover ? supabase.from("users").select("id, full_name") : Promise.resolve({ data: null }),
  ]);

  const rows = requests ?? [];
  const { userMap, leaveTypeMap } = await loadReportLookups(supabase, rows);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value) query.set(key, String(value));
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4 pb-24">
      <h1 className="text-lg font-semibold text-foreground">รายงานสรุป</h1>

      <form method="get" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {isApprover && (
          <select
            name="user_id"
            defaultValue={searchParams.user_id ?? ""}
            className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
          >
            <option value="">ทุกคน</option>
            {(teamUsers ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        )}

        {appUser.role === "admin" && (
          <select
            name="team_id"
            defaultValue={searchParams.team_id ?? ""}
            className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
          >
            <option value="">ทุกทีม</option>
            {(teams ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <select
          name="leave_type_id"
          defaultValue={searchParams.leave_type_id ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        >
          <option value="">ทุกประเภท</option>
          {(leaveTypes ?? []).map((lt) => (
            <option key={lt.id} value={lt.id}>
              {lt.name}
            </option>
          ))}
        </select>

        <select
          name="status"
          defaultValue={searchParams.status ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        >
          <option value="">ทุกสถานะ</option>
          {(Object.keys(STATUS_LABEL_TH) as LeaveStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL_TH[s]}
            </option>
          ))}
        </select>

        <input
          type="date"
          name="from"
          defaultValue={searchParams.from ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        />
        <input
          type="date"
          name="to"
          defaultValue={searchParams.to ?? ""}
          className="h-10 rounded-xl border border-input bg-background px-2 text-sm"
        />

        <Button type="submit" variant="outline" size="sm">
          กรอง
        </Button>
      </form>

      <Button asChild>
        <a href={`/api/reports/export-excel?${query.toString()}`}>ดาวน์โหลด Excel</a>
      </Button>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-secondary text-secondary-foreground">
            <tr>
              <th className="p-3">พนักงาน</th>
              <th className="p-3">ประเภท</th>
              <th className="p-3">วันที่</th>
              <th className="p-3">จำนวนวัน</th>
              <th className="p-3">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{userMap.get(r.user_id) ?? "-"}</td>
                <td className="p-3">{leaveTypeMap.get(r.leave_type_id) ?? "-"}</td>
                <td className="p-3 whitespace-nowrap">
                  {formatThaiDate(r.start_date)} - {formatThaiDate(r.end_date)}
                </td>
                <td className="p-3">{r.total_days ?? "-"}</td>
                <td className="p-3">
                  <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{STATUS_LABEL_TH[r.status]}</Badge>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
