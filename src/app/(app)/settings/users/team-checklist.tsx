"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Pure pill-chip toggle list — no state or save button of its own. Saving is
 * consolidated one level up (UserCard) into a single button that covers
 * role + both team checklists at once, since three separate save buttons per
 * user row read as confusing ("which one do I need to click?").
 */
export function TeamChecklist({
  teams,
  selected,
  onToggle,
  onSelectAll,
  disabled,
}: {
  teams: TeamOption[];
  selected: Set<string>;
  onToggle: (teamId: string) => void;
  onSelectAll: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => {
          const isSelected = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggle(t.id)}
              disabled={disabled}
              aria-pressed={isSelected}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                isSelected
                  ? "border-primary/60 bg-accent text-accent-foreground"
                  : "border-input bg-background text-muted-foreground hover:border-primary/30 hover:bg-accent/40"
              )}
            >
              {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
              {t.name}
            </button>
          );
        })}
        {teams.length === 0 && <span className="text-sm text-muted-foreground">ยังไม่มีทีมในระบบ</span>}
      </div>
      {teams.length > 0 && (
        <Button type="button" size="sm" variant="ghost" className="self-start" disabled={disabled} onClick={onSelectAll}>
          เลือกทั้งหมด
        </Button>
      )}
    </div>
  );
}
