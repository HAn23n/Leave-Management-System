"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
 * gets filed under.
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
      <Button type="button" size="sm" variant="outline" className="self-start" disabled={pending} onClick={handleSaveClick}>
        บันทึกทีม
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
