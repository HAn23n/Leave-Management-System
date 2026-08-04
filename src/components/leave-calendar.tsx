import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_YEAR_OFFSET = 543;

export interface CalendarLeaveDay {
  color: string;
  typeName: string;
}

export interface LeaveCalendarLegendItem {
  label: string;
  color: string;
}

export function LeaveCalendarMonth({
  year,
  month,
  todayIso,
  leaveDays,
  holidays,
  legend,
  prevHref,
  nextHref,
}: {
  year: number;
  month: number; // 0-indexed, CE year
  todayIso: string;
  leaveDays: Map<string, CalendarLeaveDay>;
  holidays: Map<string, string>;
  legend: LeaveCalendarLegendItem[];
  prevHref: string;
  nextHref: string;
}) {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay(); // 0 = Sunday

  const cells: { day: number; iso: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link
          href={prevHref}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="เดือนก่อนหน้า"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES[month]} {year + THAI_YEAR_OFFSET}
        </span>
        <Link
          href={nextHref}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="เดือนถัดไป"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {cells.map(({ day, iso }) => {
          const holidayName = holidays.get(iso);
          const leave = leaveDays.get(iso);
          const isToday = iso === todayIso;

          return (
            <div
              key={iso}
              title={holidayName ?? leave?.typeName}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium",
                !holidayName && !leave && "text-foreground",
                isToday && "ring-2 ring-primary ring-offset-1"
              )}
              style={
                holidayName
                  ? { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                  : leave
                    ? { backgroundColor: `${leave.color}22`, color: leave.color }
                    : undefined
              }
            >
              <span>{day}</span>
              {(holidayName || leave) && (
                <span
                  className="mt-0.5 h-1 w-1 rounded-full"
                  style={{ backgroundColor: holidayName ? "hsl(var(--muted-foreground))" : leave?.color }}
                />
              )}
            </div>
          );
        })}
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--muted-foreground))" }} />
            วันหยุด
          </span>
        </div>
      )}
    </div>
  );
}
