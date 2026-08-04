"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_YEAR_OFFSET = 543;

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Popover calendar ("scheduler") date picker. Shows Buddhist Era in the
 * header and highlights holidays in-grid so the user can see conflicts
 * before picking a date. Emits/accepts ISO 'yyyy-MM-dd' in Gregorian (CE),
 * same as the DB.
 */
export function CalendarDatePicker({
  value,
  onChange,
  holidays,
  disabled,
}: {
  value: string | null;
  onChange: (isoDate: string) => void;
  holidays: Map<string, string>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());

  useEffect(() => {
    if (!open) return;
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const today = new Date();
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  function goMonth(delta: number) {
    const total = viewYear * 12 + viewMonth + delta;
    setViewYear(Math.floor(total / 12));
    setViewMonth(((total % 12) + 12) % 12);
  }

  function pick(day: number) {
    onChange(toIso(viewYear, viewMonth, day));
    setOpen(false);
  }

  const displayLabel = value
    ? (() => {
        const d = new Date(`${value}T00:00:00`);
        return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + THAI_YEAR_OFFSET}`;
      })()
    : "เลือกวันที่";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-full items-center rounded-xl border border-input bg-background py-2 pl-3 pr-9 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="block flex-1 truncate">{displayLabel}</span>
        <CalendarDays className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-2xl border border-border bg-white p-3 shadow-lg">
          <div className="flex items-center justify-between pb-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {MONTH_NAMES[viewMonth]} {viewYear + THAI_YEAR_OFFSET}
            </span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="เดือนถัดไป"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
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
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
              const iso = toIso(viewYear, viewMonth, day);
              const holidayName = holidays.get(iso);
              const isSelected = iso === value;
              const isToday = iso === todayIso;
              const dow = (leadingBlanks + day - 1) % 7;
              const isWeekend = dow === 0 || dow === 6;

              return (
                <button
                  key={iso}
                  type="button"
                  title={holidayName}
                  onClick={() => pick(day)}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors",
                    isSelected
                      ? "gradient-primary text-primary-foreground"
                      : holidayName
                        ? "bg-muted text-muted-foreground hover:bg-accent"
                        : isWeekend
                          ? "text-muted-foreground hover:bg-accent"
                          : "text-foreground hover:bg-accent",
                    isToday && !isSelected && "ring-1 ring-primary"
                  )}
                >
                  <span>{day}</span>
                  {holidayName && !isSelected && (
                    <span className="mt-0.5 h-1 w-1 rounded-full bg-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>

          {(() => {
            const monthHolidays = Array.from(holidays.entries()).filter(([iso]) =>
              iso.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`)
            );
            if (monthHolidays.length === 0) return null;
            return (
              <div className="mt-2 flex flex-col gap-0.5 border-t border-border pt-2 text-xs text-muted-foreground">
                {monthHolidays.map(([iso, name]) => (
                  <span key={iso}>
                    {Number(iso.slice(8, 10))} {MONTH_NAMES[viewMonth]} — {name}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
