import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAppUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { nowInBangkok, todayIso } from "@/lib/date";
import { STATUS_LABEL_TH, STATUS_ACCENT_CLASS } from "@/lib/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveCalendarMonth, type CalendarLeaveDay } from "@/components/leave-calendar";
import { PendingTeamRequestsCard } from "@/components/pending-team-requests-card";
import { AttendanceCard } from "@/components/attendance-card";
import type { Database, LeaveStatus } from "@/lib/supabase/types";
import { displayName } from "@/lib/users";
import { isAlreadyActedByApprover } from "@/lib/leave-requests";

const SUMMARY_STATUSES: LeaveStatus[] = ["draft", "pending", "approved", "rejected", "returned"];

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

async function loadAttendanceToday(supabase: SupabaseClient<Database>, userId: string) {
  const [{ data: log }, { data: settings }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("check_in_at, check_out_at")
      .eq("user_id", userId)
      .eq("work_date", todayIso())
      .maybeSingle(),
    supabase.from("attendance_settings").select("break_hours").eq("id", 1).maybeSingle(),
  ]);
  return {
    checkInAt: log?.check_in_at ?? null,
    checkOutAt: log?.check_out_at ?? null,
    breakHours: settings?.break_hours ?? 1,
  };
}

async function loadPendingTeamRequests(supabase: SupabaseClient<Database>, viewerId: string) {
  const { data: pendingTeamRequests } = await supabase
    .from("leave_requests")
    .select("id, request_no, user_id, leave_type_id, team_id, current_level, start_date, end_date, total_days, status")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  let requesterMap = new Map<string, string>();
  let leaveTypeMap = new Map<string, string>();
  const alreadyActedByMe = new Map<string, boolean>();
  if (pendingTeamRequests && pendingTeamRequests.length > 0) {
    const userIds = Array.from(new Set(pendingTeamRequests.map((r) => r.user_id)));
    const leaveTypeIds = Array.from(new Set(pendingTeamRequests.map((r) => r.leave_type_id)));
    // Admin client, scoped to just the requesters in this already-RLS-filtered
    // result set — see the same fix on the request detail/search pages: a
    // requester's *current* team membership shouldn't be able to blank out
    // their name on a request this viewer is already allowed to see.
    const [{ data: users }, { data: pendingLeaveTypes }, { data: ownLeadRows }] = await Promise.all([
      createAdminSupabaseClient().from("users").select("id, email, nickname").in("id", userIds),
      supabase.from("leave_types").select("id, name").in("id", leaveTypeIds),
      supabase.from("team_leads").select("team_id, approval_order").eq("user_id", viewerId),
    ]);
    requesterMap = new Map((users ?? []).map((u) => [u.id, displayName(u)]));
    leaveTypeMap = new Map((pendingLeaveTypes ?? []).map((lt) => [lt.id, lt.name]));
    // Same "already acted at my own level" check as the search list — an
    // approver leading multiple levels/teams shouldn't see a plain "รออนุมัติ"
    // on a request that's actually just waiting on someone else now.
    const ownApprovalOrderByTeam = new Map((ownLeadRows ?? []).map((l) => [l.team_id, l.approval_order]));
    for (const r of pendingTeamRequests) {
      alreadyActedByMe.set(r.id, isAlreadyActedByApprover(r.status, r.current_level, ownApprovalOrderByTeam.get(r.team_id)));
    }
  }

  return { pendingTeamRequests: pendingTeamRequests ?? [], requesterMap, leaveTypeMap, alreadyActedByMe };
}

export default async function DashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const appUser = await requireAppUser();
  const supabase = createServerSupabaseClient();

  // Approvers only review/approve their team's documents — they never file
  // their own leave anymore, so their home screen is just the approval queue.
  if (appUser.role === "approver") {
    const [{ pendingTeamRequests, requesterMap, leaveTypeMap, alreadyActedByMe }, attendance] = await Promise.all([
      loadPendingTeamRequests(supabase, appUser.id),
      loadAttendanceToday(supabase, appUser.id),
    ]);

    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-24">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">สวัสดี, {displayName(appUser)}</h1>
          <p className="text-sm text-muted-foreground">คำขอรออนุมัติของทีม</p>
        </div>

        <AttendanceCard
          checkInAt={attendance.checkInAt}
          checkOutAt={attendance.checkOutAt}
          breakHours={attendance.breakHours}
        />

        <PendingTeamRequestsCard
          requests={pendingTeamRequests}
          requesterMap={requesterMap}
          leaveTypeMap={leaveTypeMap}
          alreadyActedByMe={alreadyActedByMe}
        />
      </main>
    );
  }

  const now = nowInBangkok();
  let year = now.getFullYear();
  let month = now.getMonth();
  if (searchParams.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(searchParams.month)) {
    const [y, m] = searchParams.month.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  const monthStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const isAdmin = appUser.role === "admin";

  const [{ data: ownRequests }, { data: monthRequests }, { data: leaveTypes }, { data: holidayRows }, pendingTeam, attendance] =
    await Promise.all([
      supabase.from("leave_requests").select("status").eq("user_id", appUser.id),
      // Only confirmed (approved) leave shows as "on leave" in the calendar —
      // a pending request hasn't actually been granted yet, and could still
      // be rejected/returned.
      supabase
        .from("leave_requests")
        .select("start_date, end_date, leave_type_id")
        .eq("user_id", appUser.id)
        .eq("status", "approved")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart),
      supabase.from("leave_types").select("id, name, color"),
      supabase.from("holidays").select("holiday_date, name").gte("holiday_date", monthStart).lte("holiday_date", monthEnd),
      isAdmin
        ? loadPendingTeamRequests(supabase, appUser.id)
        : Promise.resolve({
            pendingTeamRequests: [],
            requesterMap: new Map(),
            leaveTypeMap: new Map(),
            alreadyActedByMe: new Map<string, boolean>(),
          }),
      loadAttendanceToday(supabase, appUser.id),
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
        <h1 className="text-xl font-bold tracking-tight text-foreground">สวัสดี, {displayName(appUser)}</h1>
        <p className="text-sm text-muted-foreground">สรุปคำขอลาของฉัน</p>
      </div>

      <AttendanceCard
        checkInAt={attendance.checkInAt}
        checkOutAt={attendance.checkOutAt}
        breakHours={attendance.breakHours}
      />

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
          alreadyActedByMe={pendingTeam.alreadyActedByMe}
        />
      )}
    </main>
  );
}
