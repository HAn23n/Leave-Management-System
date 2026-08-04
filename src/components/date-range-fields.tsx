"use client";

import { useState } from "react";
import { CalendarDatePicker } from "./calendar-date-picker";
import { Label } from "@/components/ui/label";

/**
 * Paired "ตั้งแต่วันที่" / "ถึงวันที่" fields for a plain <form> (GET
 * filters) — each end constrains the other (to's minDate = from, from's
 * maxDate = to) so an invalid range can't be picked in the first place.
 */
export function DateRangeFields({
  fromName,
  toName,
  fromDefault,
  toDefault,
  holidays,
}: {
  fromName: string;
  toName: string;
  fromDefault?: string | null;
  toDefault?: string | null;
  holidays: Map<string, string>;
}) {
  const [from, setFrom] = useState<string | null>(fromDefault ?? null);
  const [to, setTo] = useState<string | null>(toDefault ?? null);

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">ตั้งแต่วันที่</Label>
        <CalendarDatePicker
          name={fromName}
          value={from}
          onChange={setFrom}
          holidays={holidays}
          maxDate={to ?? undefined}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">ถึงวันที่</Label>
        <CalendarDatePicker
          name={toName}
          value={to}
          onChange={setTo}
          holidays={holidays}
          minDate={from ?? undefined}
        />
      </div>
    </>
  );
}
