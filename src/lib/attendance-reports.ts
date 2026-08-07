import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format, parse, isValid } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { AppUser, AttendanceLog, AttendanceSettings, Database } from "@/lib/supabase/types";
import { computeWorkedHours } from "@/lib/attendance";
import { BANGKOK_TZ, todayIso } from "@/lib/date";

export interface AttendanceFilters {
  userId?: string;
  teamId?: string;
  from?: string;
  to?: string;
}

/**
 * attendance_logs has no team_id of its own (attendance isn't filed "under" a
 * team the way a leave request is) — a team filter has to first resolve which
 * users belong to that team via user_teams, then filter by user_id. RLS still
 * scopes the underlying rows to what the caller's session is allowed to see
 * regardless of what's passed in here, same as buildReportQuery.
 */
export async function buildAttendanceQuery(supabase: SupabaseClient<Database>, filters: AttendanceFilters) {
  let query = supabase.from("attendance_logs").select("*").order("work_date", { ascending: true });

  if (filters.userId && filters.userId !== "all") {
    query = query.eq("user_id", filters.userId);
  } else if (filters.teamId && filters.teamId !== "all") {
    const { data: members } = await supabase.from("user_teams").select("user_id").eq("team_id", filters.teamId);
    const ids = (members ?? []).map((m) => m.user_id);
    // No members -> force a no-match rather than an unfiltered .in([]) (which
    // PostgREST would otherwise treat as "no filter at all").
    query = query.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  if (filters.from) query = query.gte("work_date", filters.from);
  if (filters.to) query = query.lte("work_date", filters.to);

  return query;
}

/** Weekdays (Mon-Fri) in [from, to] that aren't a holiday and aren't today-or-later — a day still in progress can't yet be "missing". */
export function expectedWorkDates(from: string, to: string, holidayDates: string[]): string[] {
  const start = parse(from, "yyyy-MM-dd", new Date());
  const end = parse(to, "yyyy-MM-dd", new Date());
  if (!isValid(start) || !isValid(end) || start > end) return [];

  const holidaySet = new Set(holidayDates);
  const today = todayIso();
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = format(cursor, "yyyy-MM-dd");
    const dow = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso) && iso < today) {
      dates.push(iso);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function timeOfDayMinutes(iso: string): number {
  const zoned = toZonedTime(iso, BANGKOK_TZ);
  return zoned.getHours() * 60 + zoned.getMinutes();
}

function timeStringToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export interface AttendanceSummaryRow {
  userId: string;
  daysWorked: number;
  totalHours: number;
  lateCount: number;
  earlyLeaveCount: number;
  missingCount: number;
}

/**
 * One row per user in `rosterUserIds`, even a user with zero attendance_logs
 * rows in range (shows up as fully "missing") — the roster is the same
 * employee list already loaded for the report's "พนักงาน" filter dropdown, so
 * a manager can see who never checked in at all, not just who was late.
 */
export function summarizeAttendance(
  logs: AttendanceLog[],
  rosterUserIds: string[],
  settings: Pick<AttendanceSettings, "check_in_reminder_time" | "check_out_reminder_time" | "break_hours">,
  expectedDates: string[]
): AttendanceSummaryRow[] {
  const byUser = new Map<string, AttendanceLog[]>();
  for (const log of logs) {
    const arr = byUser.get(log.user_id) ?? [];
    arr.push(log);
    byUser.set(log.user_id, arr);
  }

  const lateThreshold = timeStringToMinutes(settings.check_in_reminder_time);
  const earlyThreshold = timeStringToMinutes(settings.check_out_reminder_time);

  return rosterUserIds.map((userId) => {
    const userLogs = byUser.get(userId) ?? [];
    let daysWorked = 0;
    let totalHours = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;

    for (const log of userLogs) {
      if (log.check_in_at) {
        daysWorked += 1;
        if (timeOfDayMinutes(log.check_in_at) > lateThreshold) lateCount += 1;
      }
      if (log.check_in_at && log.check_out_at) {
        totalHours += computeWorkedHours(log.check_in_at, log.check_out_at, settings.break_hours);
        if (timeOfDayMinutes(log.check_out_at) < earlyThreshold) earlyLeaveCount += 1;
      }
    }

    const byDate = new Map(userLogs.map((l) => [l.work_date, l]));
    let missingCount = 0;
    for (const date of expectedDates) {
      const log = byDate.get(date);
      if (!log?.check_in_at || !log?.check_out_at) missingCount += 1;
    }

    return { userId, daysWorked, totalHours, lateCount, earlyLeaveCount, missingCount };
  });
}

export interface AttendanceDailyRow {
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  hours: number | null;
}

/** Per-user daily rows, sorted oldest-first, for the "รายวัน" table under each person. */
export function groupDailyRows(logs: AttendanceLog[], breakHours: number): Map<string, AttendanceDailyRow[]> {
  const byUser = new Map<string, AttendanceDailyRow[]>();
  for (const log of [...logs].sort((a, b) => a.work_date.localeCompare(b.work_date))) {
    const rows = byUser.get(log.user_id) ?? [];
    rows.push({
      workDate: log.work_date,
      checkInAt: log.check_in_at,
      checkOutAt: log.check_out_at,
      hours: log.check_in_at && log.check_out_at ? computeWorkedHours(log.check_in_at, log.check_out_at, breakHours) : null,
    });
    byUser.set(log.user_id, rows);
  }
  return byUser;
}

export interface RosterUser {
  id: string;
  email: string;
  nickname: string | null;
}

/**
 * Who the summary/daily tables should list, even a user with zero
 * attendance_logs rows in range (shows up as fully "missing"). `teamUsers` is
 * the RLS-scoped roster already loaded for the page's "พนักงาน" filter
 * dropdown (empty/null for a plain user, who only ever sees themselves).
 * Shared between the report page and the Excel export route so the two can't
 * drift on who counts as "in scope".
 */
export async function resolveAttendanceRoster(
  supabase: SupabaseClient<Database>,
  appUser: Pick<AppUser, "id" | "email" | "nickname">,
  isApprover: boolean,
  teamUsers: RosterUser[] | null,
  userId?: string,
  teamId?: string
): Promise<RosterUser[]> {
  if (userId && userId !== "all") {
    // A plain user's own id never appears in `teamUsers` (that list is only
    // fetched for approvers) — resolve self from `appUser` directly instead
    // of falling through to the "-" placeholder below.
    if (userId === appUser.id) {
      return [{ id: appUser.id, email: appUser.email, nickname: appUser.nickname }];
    }
    const chosen = (teamUsers ?? []).find((u) => u.id === userId);
    return chosen ? [chosen] : [{ id: userId, email: "-", nickname: null }];
  }
  if (teamId && teamId !== "all") {
    const { data: members } = await supabase.from("user_teams").select("user_id").eq("team_id", teamId);
    const memberIds = new Set((members ?? []).map((m) => m.user_id));
    return (teamUsers ?? []).filter((u) => memberIds.has(u.id));
  }
  if (isApprover) return teamUsers ?? [];
  return [{ id: appUser.id, email: appUser.email, nickname: appUser.nickname }];
}

export async function loadAttendanceSettings(supabase: SupabaseClient<Database>): Promise<AttendanceSettings> {
  const { data } = await supabase.from("attendance_settings").select("*").eq("id", 1).maybeSingle();
  return (
    data ?? {
      id: 1,
      check_in_reminder_time: "08:30",
      check_out_reminder_time: "17:30",
      standard_work_hours: 8,
      break_hours: 1,
      last_check_in_reminder_date: null,
      last_check_out_reminder_date: null,
      updated_at: new Date().toISOString(),
    }
  );
}
