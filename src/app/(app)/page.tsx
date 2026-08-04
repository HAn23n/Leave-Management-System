import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nowInBangkok, todayIso } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_ACCENT_CLASS } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveCalendarMonth, type CalendarLeaveDay } from "@/components/leave-calendar";
import { PendingTeamRequestsCard } from "@/components/pending-team-requests-card";
import type { Database, LeaveStatus } from "@/lib/supabase/types";

const SUMMARY_STATUSES: LeaveStatus[] = ["draft", "pending", "approved", "rejected", "returned"];

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

async function loadPendingTeamRequests(supabase: SupabaseClient<Database>) {
  const { data: pendingTeamRequests } = await supabase
    .from("leave_requests")
    .select("id, request_no, user_id, leave_type_id, start_date, end_date, total_days")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  let requesterMap = new Map<string, string>();
  let leaveTypeMap = new Map<string, string>();
  if (pendingTeamRequests && pendingTeamRequests.length > 0) {
    const userIds = Array.from(new Set(pendingTeamRequests.map((r) => r.user_id)));
    const leaveTypeIds = Array.from(new Set(pendingTeamRequests.map((r) => r.leave_type_id)));
    const [{ data: users }, { data: pendingLeaveTypes }] = await Promise.all([
      supabase.from("users").select("id, full_name").in("id", userIds),
      supabase.from("leave_types").select("id, name").in("id", leaveTypeIds),
    ]);
    requesterMap = new Map((users ?? []).map((u) => [u.id, u.full_name]));
    leaveTypeMap = new Map((pendingLeaveTypes ?? []).map((lt) => [lt.id, lt.name]));
  }

  return { pendingTeamRequests: pendingTeamRequests ?? [], requesterMap, leaveTypeMap };
}

export default async function DashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  // Approvers only review/approve their team's documents — they never file
  // their own leave anymore, so their home screen is just the approval queue.
  if (appUser.role === "approver") {
    const { pendingTeamRequests, requesterMap, leaveTypeMap } = await loadPendingTeamRequests(supabase);

    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-24">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">สวัสดี, {appUser.full_name}</h1>
          <p className="text-sm text-muted-foreground">คำขอรออนุมัติของทีม</p>
        </div>

        <PendingTeamRequestsCard
          requests={pendingTeamRequests}
          requesterMap={requesterMap}
          leaveTypeMap={leaveTypeMap}
        />
      </main>
    );
  }

  const now = nowInBangkok();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)) {
    const [y, m] = searchParams.month.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const isAdmin = appUser.role === "admin";

  const [{ data: ownRequests }, { data: monthRequests }, { data: leaveTypes }, { data: holidayRows }, pendingTeam] =
    await Promise.all([
      supabase.from("leave_requests").select("status").eq("user_id", appUser.id),
      supabase
        .from("leave_requests")
        .select("start_date, end_date, leave_type_id")
        .eq("user_id", appUser.id)
        .in("status", ["pending", "approved"])
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
      supabase.from("leave_types").select("id, name, color"),
      supabase.from("holidays").select("holiday_date, name").gte("holiday_date", monthStart).lte("holiday_date", monthEnd),
      isAdmin
        ? loadPendingTeamRequests(supabase)
        : Promise.resolve({ pendingTeamRequests: [], requesterMap: new Map(), leaveTypeMap: new Map() }),
    ]);

  const leaveTypeMapFull = new Map((leaveTypes ?? []).map((lt) => [lt.id, lt]));
  const holidayMap = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));

  const leaveDayMap = new Map<string, CalendarLeaveDay>();
  const legendTypes = new Map<string, string>();
  for (const r of monthRequests ?? []) {
    const lt = leaveTypeMapFull.get(r.leave_type_id);
    if (!lt) continue;
    const cursor = new Date(`${r.start_date > monthStart ? r.start_date : monthStart}T00:00:00`);
    const end = new Date(`${r.end_date < monthEnd ? r.end_date : monthEnd}T00:00:00`);
    while (cursor <= end) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate()
      ).padStart(2, "0")}`;
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6 && !holidayMap.has(iso)) {
        leaveDayMap.set(iso, { color: lt.color, typeName: lt.name });
        legendTypes.set(lt.name, lt.color);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  const counts = SUMMARY_STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (ownRequests ?? []).filter((r) => r.status === s).length;
    return acc;
  }, {});

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-24">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">สวัสดี, {appUser.full_name}</h1>
        <p className="text-sm text-muted-foreground">สรุปคำขอลาของฉัน</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ปฏิทินการลา</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaveCalendarMonth
            year={year}
            month={month}
            todayIso={todayIso()}
            leaveDays={leaveDayMap}
            holidays={holidayMap}
            legend={Array.from(legendTypes, ([label, color]) => ({ label, color }))}
            prevHref={`/?month=${prev.year}-${String(prev.month + 1).padStart(2, "0")}`}
            nextHref={`/?month=${next.year}-${String(next.month + 1).padStart(2, "0")}`}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {SUMMARY_STATUSES.map((status) => (
          <Link key={status} href={`/leave-requests?status=${status}`}>
            <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className={`h-1 w-full ${STATUS_ACCENT_CLASS[status]}`} />
              <CardContent className="flex flex-col gap-1 p-4">
                <span className="text-3xl font-bold tracking-tight text-foreground">{counts[status] ?? 0}</span>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL_TH[status]}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <PendingTeamRequestsCard
          requests={pendingTeam.pendingTeamRequests}
          requesterMap={pendingTeam.requesterMap}
          leaveTypeMap={pendingTeam.leaveTypeMap}
        />
      )}
    </main>
  );
}
