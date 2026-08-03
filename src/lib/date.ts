import { format, parse, isValid } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const BANGKOK_TZ = "Asia/Bangkok";
const THAI_YEAR_OFFSET = 543;

/**
 * Formats a Gregorian (CE) date (from the DB, 'yyyy-MM-dd' string or Date) as a
 * Buddhist Era (BE) display string. E.g. '2026-08-03' -> '3 ส.ค. 2569'.
 */
export function formatThaiDate(
  dateInput: string | Date,
  pattern: "short" | "long" | "iso-be" = "short"
): string {
  const date = typeof dateInput === "string" ? parse(dateInput, "yyyy-MM-dd", new Date()) : dateInput;
  if (!isValid(date)) return "-";

  const buddhistYear = date.getFullYear() + THAI_YEAR_OFFSET;
  const day = date.getDate();
  const month = date.getMonth();

  const monthShort = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const monthLong = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];

  if (pattern === "iso-be") {
    return `${day.toString().padStart(2, "0")}/${(month + 1)
      .toString()
      .padStart(2, "0")}/${buddhistYear}`;
  }
  if (pattern === "long") {
    return `${day} ${monthLong[month]} ${buddhistYear}`;
  }
  return `${day} ${monthShort[month]} ${buddhistYear}`;
}

/**
 * Converts a Buddhist Era (BE) date from a date picker/input back to Gregorian
 * (CE, 'yyyy-MM-dd') before saving to the DB. Accepts a Date whose year is
 * already BE (e.g. a date picker displaying BE), or set sourceIsBuddhistYear
 * to false for a plain CE year from <input type="date">.
 */
export function parseThaiDate(dateInput: Date, sourceIsBuddhistYear = false): string {
  const year = sourceIsBuddhistYear
    ? dateInput.getFullYear() - THAI_YEAR_OFFSET
    : dateInput.getFullYear();
  const ce = new Date(dateInput);
  ce.setFullYear(year);
  return format(ce, "yyyy-MM-dd");
}

export function nowInBangkok(): Date {
  return toZonedTime(new Date(), BANGKOK_TZ);
}

export function todayIso(): string {
  return format(nowInBangkok(), "yyyy-MM-dd");
}

export type LeavePeriodClient = "full" | "morning" | "afternoon";

/**
 * Client-side leave day calculation for realtime form preview.
 * Same logic as calc_total_days() in the SQL migration — keep both in sync.
 * holidayDates: array of 'yyyy-MM-dd' (CE) dates from the holidays table.
 */
export function calcTotalDaysClient(
  startDate: string,
  endDate: string,
  startPeriod: LeavePeriodClient,
  endPeriod: LeavePeriodClient,
  holidayDates: string[]
): number {
  const start = parse(startDate, "yyyy-MM-dd", new Date());
  const end = parse(endDate, "yyyy-MM-dd", new Date());
  if (!isValid(start) || !isValid(end) || start > end) return 0;

  const holidaySet = new Set(holidayDates);
  let total = 0;
  const cursor = new Date(start);

  while (cursor <= end) {
    const iso = format(cursor, "yyyy-MM-dd");
    const dow = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    const isBusinessDay = dow !== 0 && dow !== 6 && !holidaySet.has(iso);

    if (isBusinessDay) {
      const isStart = iso === startDate;
      const isEnd = iso === endDate;

      if (isStart && isEnd) {
        total += startPeriod === "full" && endPeriod === "full" ? 1 : 0.5;
      } else if (isStart) {
        total += startPeriod === "full" ? 1 : 0.5;
      } else if (isEnd) {
        total += endPeriod === "full" ? 1 : 0.5;
      } else {
        total += 1;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return total;
}
