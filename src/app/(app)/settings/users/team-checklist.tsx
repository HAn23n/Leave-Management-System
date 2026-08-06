"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface TeamOption {
  id: string;
  name: string;
}

/**
 * A checkbox list submitted via a bound server action, kept as controlled
 * state instead of defaultChecked — an uncontrolled input's defaultChecked
 * only applies on mount, so after "เลือกทั้งหมด" saved, the checkboxes kept
 * showing their pre-click state until a manual reload. "เลือกทั้งหมด" only
 * checks every box locally — it does not save by itself; the admin still
 * has to press the save button, same as ticking boxes by hand.
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
      <div className="flex flex-wrap gap-3">
        {teams.map((t) => (
          <label key={t.id} className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={selected.has(t.id)}
              onChange={() => toggle(t.id)}
              disabled={pending}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            {t.name}
          </label>
        ))}
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
