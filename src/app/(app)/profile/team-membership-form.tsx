"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface TeamOption {
  id: string;
  name: string;
}

/**
 * Self-service team membership — unlike the admin-side TeamChecklist, this
 * one has a floor (can't save down to zero teams, since that locks the user
 * out to /onboarding/team) and confirms before actually removing a team,
 * since dropping membership can affect which team a future leave request
 * gets filed under. Same card-grid look as the onboarding team picker, so
 * the two don't visually drift apart.
 */
export function TeamMembershipForm({
  teams,
  initialSelected,
  action,
}: {
  teams: TeamOption[];
  initialSelected: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const hasChanges =
    selected.size !== initialSelected.length || initialSelected.some((id) => !selected.has(id));

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
    Array.from(selected).forEach((id) => formData.append("team_ids", id));

    startTransition(async () => {
      await action(formData);
      toast({ variant: "success", title: "บันทึกทีมแล้ว" });
      router.refresh();
    });
  }

  function handleSaveClick() {
    if (selected.size === 0) {
      toast({ variant: "destructive", title: "ต้องเลือกอย่างน้อย 1 ทีม" });
      return;
    }
    const removingATeam = initialSelected.some((id) => !selected.has(id));
    if (removingATeam) {
      setConfirmOpen(true);
      return;
    }
    save();
  }

  return (
    <div className="flex flex-col gap-3">
      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">ยังไม่มีทีมในระบบ</p>
      ) : (
        // Capped height + scroll so a large team count (20+) grows inside
        // this box instead of pushing the rest of the page down indefinitely.
        <div className="grid max-h-72 grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
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
                  "relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-150 disabled:pointer-events-none disabled:opacity-50",
                  isSelected
                    ? "border-primary/60 bg-accent shadow-sm shadow-primary/10"
                    : "border-input bg-background hover:border-primary/30 hover:bg-accent/40"
                )}
              >
                <span
                  className={cn(
                    "absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                    isSelected ? "gradient-primary border-transparent text-primary-foreground" : "border-input bg-background"
                  )}
                >
                  {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full",
                    isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-medium leading-tight text-foreground">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
      <Button
        type="button"
        size="sm"
        variant={hasChanges ? "default" : "outline"}
        className="self-start"
        disabled={pending || !hasChanges}
        onClick={handleSaveClick}
      >
        {pending ? "กำลังบันทึก..." : "บันทึกทีม"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="ยืนยันการออกจากทีม"
        description="คุณกำลังจะออกจากทีมที่ไม่ได้เลือกไว้ ประวัติการลาเดิมจะไม่หายไป แต่คุณจะยื่นคำขอลาภายใต้ทีมนั้นไม่ได้อีก ต้องการดำเนินการต่อหรือไม่?"
        confirmLabel="ยืนยัน"
        cancelLabel="ยกเลิก"
        onConfirm={() => {
          setConfirmOpen(false);
          save();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
