import type { LeavePeriod } from "@/lib/supabase/types";

export interface ExistingLeaveRange {
  start_date: string;
  end_date: string;
  start_period: LeavePeriod;
  end_period: LeavePeriod;
}

export type DayOccupancy = "full" | "morning" | "afternoon";

/**
 * Merges a user's existing pending/approved leave into a per-date occupancy
 * map, mirroring check_leave_overlap()'s rule: two single-day half-day
 * requests on the same date (morning + afternoon) don't conflict, anything
 * else touching the same date does. Days strictly between a multi-day
 * request's start/end are always full (the whole day is taken).
 */
export function buildOccupiedDates(existing: ExistingLeaveRange[]): Map<string, DayOccupancy> {
  const map = new Map<string, DayOccupancy>();

  const mark = (date: string, period: DayOccupancy) => {
    const current = map.get(date);
    if (!current || current === "full" || period === "full" || current !== period) {
      map.set(date, !current || current === period ? period : "full");
    }
  };

  for (const r of existing) {
    if (r.start_date === r.end_date) {
      mark(r.start_date, r.start_period === "full" ? "full" : r.start_period);
      continue;
    }

    mark(r.start_date, r.start_period === "full" ? "full" : r.start_period);
    mark(r.end_date, r.end_period === "full" ? "full" : r.end_period);

    const cursor = new Date(`${r.start_date}T00:00:00`);
    cursor.setDate(cursor.getDate() + 1);
    const end = new Date(`${r.end_date}T00:00:00`);
    while (cursor < end) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
        cursor.getDate()
      ).padStart(2, "0")}`;
      mark(iso, "full");
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return map;
}
