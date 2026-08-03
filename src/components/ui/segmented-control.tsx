"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A tactile button-group alternative to a native <select> — better for a
 * small, fixed set of options like the leave period (full/morning/afternoon)
 * on touch devices, where a dropdown adds an extra tap for no benefit.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className="flex gap-1 rounded-xl bg-secondary p-1"
      aria-disabled={disabled}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center rounded-lg px-2 text-sm font-medium transition-all duration-150",
              active
                ? "gradient-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
