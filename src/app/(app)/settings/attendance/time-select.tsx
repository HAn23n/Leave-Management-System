"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Replaces the native <input type="time"> — its browser-default picker
 * (a raw scrolling hour/minute list, styled by the OS, not us) looked out
 * of place next to the rest of the app's UI kit. Two Selects styled like
 * everywhere else, combined into one "HH:mm" hidden field so the parent
 * <form>/server action doesn't need to change.
 */
export function TimeSelect({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [defaultHour, defaultMinute] = defaultValue.split(":");
  const [hour, setHour] = useState(defaultHour || "08");
  const [minute, setMinute] = useState(defaultMinute || "00");

  return (
    <div className="flex items-center gap-2">
      <Select value={hour} onValueChange={setHour}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOURS.map((h) => (
            <SelectItem key={h} value={h}>
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select value={minute} onValueChange={setMinute}>
        <SelectTrigger className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MINUTES.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={`${hour}:${minute}`} />
    </div>
  );
}
