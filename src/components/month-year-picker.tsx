"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_YEAR_OFFSET = 543;

// Aligns the 12-year picker grid to a fixed page, same convention as CalendarDatePicker.
function yearsPageStart(year: number): number {
  return Math.floor(year / 12) * 12;
}

function parsePeriod(period: string): { year: number; month: number } {
  const [y, m] = period.split("-").map(Number);
  return { year: y, month: m - 1 };
}

function toPeriod(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Popover month/year picker — same panel mechanics and visual language as
 * CalendarDatePicker (its "months"/"years" views), pulled out standalone for
 * pickers that only ever need a month, not a specific day (e.g. the
 * evaluation period).
 */
export function MonthYearPicker({
  value,
  onChange,
  disabled,
}: {
  /** 'yyyy-MM' */
  value: string;
  onChange: (period: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"months" | "years">("months");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = parsePeriod(value);
  const [viewYear, setViewYear] = useState(selected.year);

  useEffect(() => {
    if (!open) return;
    setViewYear(parsePeriod(value).year);
    setViewMode("months");
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

  function pickMonth(month: number) {
    onChange(toPeriod(viewYear, month));
    setOpen(false);
  }

  const displayLabel = `${MONTH_NAMES[selected.month]} ${selected.year + THAI_YEAR_OFFSET}`;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-full max-w-xs items-center rounded-xl border border-input bg-background py-2 pl-3 pr-9 text-left text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="block flex-1 truncate font-medium text-foreground">{displayLabel}</span>
        <CalendarDays className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" aria-hidden />
          <div className="fixed inset-x-4 top-1/2 z-50 max-h-[80vh] -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-white p-3 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-auto sm:z-50 sm:mt-1 sm:w-72 sm:max-h-none sm:translate-y-0 sm:overflow-visible">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                onClick={() => setViewYear((y) => (viewMode === "months" ? y - 1 : y - 12))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="ก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setViewMode(viewMode === "months" ? "years" : "months")}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
              >
                {viewMode === "months"
                  ? `${viewYear + THAI_YEAR_OFFSET}`
                  : `${yearsPageStart(viewYear) + THAI_YEAR_OFFSET}–${yearsPageStart(viewYear) + 11 + THAI_YEAR_OFFSET}`}
              </button>

              <button
                type="button"
                onClick={() => setViewYear((y) => (viewMode === "months" ? y + 1 : y + 12))}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                aria-label="ถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {viewMode === "months" && (
              <div className="grid grid-cols-3 gap-1.5">
                {MONTH_NAMES.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => pickMonth(i)}
                    className={cn(
                      "rounded-lg py-2 text-xs font-medium transition-colors hover:bg-accent",
                      i === selected.month && viewYear === selected.year
                        ? "gradient-primary text-primary-foreground"
                        : "text-foreground"
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {viewMode === "years" && (
              <div className="grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => yearsPageStart(viewYear) + i).map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setViewYear(y);
                      setViewMode("months");
                    }}
                    className={cn(
                      "rounded-lg py-2 text-xs font-medium transition-colors hover:bg-accent",
                      y === selected.year ? "gradient-primary text-primary-foreground" : "text-foreground"
                    )}
                  >
                    {y + THAI_YEAR_OFFSET}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
