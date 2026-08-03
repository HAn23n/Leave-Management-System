"use client";

import { parseThaiDate } from "@/lib/date";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_YEAR_OFFSET = 543;

function daysInMonth(ceYear: number, monthIndex: number): number {
  return new Date(ceYear, monthIndex + 1, 0).getDate();
}

/**
 * A day/month/year(BE) picker built from plain <select>s — no native
 * <input type="date"> is used because it can't display the Buddhist Era year
 * the spec requires. Emits/accepts ISO 'yyyy-MM-dd' in Gregorian (CE), same
 * as the DB, converting to/from BE only for display.
 */
export function ThaiDateSelect({
  value,
  onChange,
  yearRangeBE,
  disabled,
}: {
  value: string | null;
  onChange: (isoDate: string) => void;
  yearRangeBE?: [number, number];
  disabled?: boolean;
}) {
  const today = new Date();
  const currentBEYear = today.getFullYear() + THAI_YEAR_OFFSET;
  const [minBE, maxBE] = yearRangeBE ?? [currentBEYear - 1, currentBEYear + 2];

  const selectedDate = value ? new Date(`${value}T00:00:00`) : null;
  const ceYear = selectedDate?.getFullYear() ?? today.getFullYear();
  const monthIndex = selectedDate?.getMonth() ?? today.getMonth();
  const day = selectedDate?.getDate() ?? today.getDate();

  function emit(nextCeYear: number, nextMonthIndex: number, nextDay: number) {
    const clampedDay = Math.min(nextDay, daysInMonth(nextCeYear, nextMonthIndex));
    const iso = parseThaiDate(new Date(nextCeYear, nextMonthIndex, clampedDay), false);
    onChange(iso);
  }

  const years = Array.from({ length: maxBE - minBE + 1 }, (_, i) => minBE + i);
  const days = Array.from({ length: daysInMonth(ceYear, monthIndex) }, (_, i) => i + 1);

  const selectClass =
    "h-11 flex-1 rounded-md border border-input bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex gap-2">
      <select
        className={selectClass}
        value={day}
        disabled={disabled}
        onChange={(e) => emit(ceYear, monthIndex, Number(e.target.value))}
      >
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        className={cn(selectClass, "flex-[2]")}
        value={monthIndex}
        disabled={disabled}
        onChange={(e) => emit(ceYear, Number(e.target.value), day)}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i}>
            {name}
          </option>
        ))}
      </select>

      <select
        className={selectClass}
        value={ceYear + THAI_YEAR_OFFSET}
        disabled={disabled}
        onChange={(e) => emit(Number(e.target.value) - THAI_YEAR_OFFSET, monthIndex, day)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
