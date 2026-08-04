"use client";

import { useState } from "react";
import { CalendarDatePicker } from "./calendar-date-picker";

/**
 * Uncontrolled wrapper around CalendarDatePicker for plain <form> usage
 * (GET filters, server actions) where the page itself is a server
 * component and can't hold the picker's React state directly.
 */
export function CalendarDateField({
  name,
  defaultValue,
  holidays,
}: {
  name: string;
  defaultValue?: string | null;
  holidays: Map<string, string>;
}) {
  const [value, setValue] = useState<string | null>(defaultValue ?? null);
  return <CalendarDatePicker name={name} value={value} onChange={setValue} holidays={holidays} />;
}
