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
 * state instead of defaultChecked — "เลือกทั้งหมด" changes the underlying
 * data without the admin having clicked each box themselves, and an
 * uncontrolled input's defaultChecked only applies on mount, so the
 * checkboxes used to keep showing the old state after that action
 * succeeded (only a manual page reload picked it up). "select all" is now
 * just this same save with every team id passed explicitly.
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

  function submit(teamIds: string[]) {
    const formData = new FormData();
    formData.append("id", userId);
    teamIds.forEach((id) => formData.append("team_ids", id));

    startTransition(async () => {
      await action(formData);
      setSelected(new Set(teamIds));
      toast({ variant: "success", title: successTitle });
      router.refresh();
    });
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => submit(Array.from(selected))}
        >
          {saveLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => submit(teams.map((t) => t.id))}
        >
          เลือกทั้งหมด
        </Button>
      </div>
    </div>
  );
}
