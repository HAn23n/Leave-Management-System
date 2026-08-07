"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Pill-chip toggles submitted via a bound server action, kept as controlled
 * state instead of defaultChecked — an uncontrolled input's defaultChecked
 * only applies on mount, so after "เลือกทั้งหมด" saved, the checkboxes kept
 * showing their pre-click state until a manual reload. "เลือกทั้งหมด" only
 * checks every box locally — it does not save by itself; the admin still
 * has to press the save button, same as toggling chips by hand. Rendered
 * twice per user (member teams + approver teams), so this is deliberately
 * compact rather than the larger card grid used on the profile/onboarding
 * pickers — that scale would make an already-expanded user row feel huge.
 */
export function TeamChecklist({
  userId,
  teams,
  initialSelected,
  action,
  saveLabel,
  successTitle,
}: {
  userId: string;
  teams: TeamOption[];
  initialSelected: string[];
  action: (formData: FormData) => Promise<void>;
  saveLabel: string;
  successTitle: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [pending, startTransition] = useTransition();

  function toggle(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function save() {
    const formData = new FormData();
    formData.append("id", userId);
    Array.from(selected).forEach((id) => formData.append("team_ids", id));

    startTransition(async () => {
      await action(formData);
      toast({ variant: "success", title: successTitle });
      router.refresh();
    });
  }

  function selectAll() {
    setSelected(new Set(teams.map((t) => t.id)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {teams.map((t) => {
          const isSelected = selected.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t.id)}
              disabled={pending}
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
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={save}>
          {saveLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={selectAll}>
          เลือกทั้งหมด
        </Button>
      </div>
    </div>
  );
}
