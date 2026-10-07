"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ToastForm } from "@/components/toast-form";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveEvaluation } from "./actions";

const CRITERIA: { field: string; label: string }[] = [
  { field: "score_punctuality", label: "ตรงต่อเวลา" },
  { field: "score_responsibility", label: "รับผิดชอบในงาน" },
  { field: "score_achievement", label: "ความสำเร็จ" },
  { field: "score_delivery", label: "การส่งมอบหมายงาน" },
  { field: "score_skill", label: "ทักษะในงาน" },
];

const SCALE = ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: v }));

export interface ExistingEvaluation {
  evaluator_id: string;
  evaluator_name: string;
  score_punctuality: number;
  score_responsibility: number;
  score_achievement: number;
  score_delivery: number;
  score_skill: number;
  total_percentage: number;
  passed: boolean;
  note: string | null;
}

function ResultBadge({ percentage, passed }: { percentage: number; passed: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        passed ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/10 text-destructive"
      )}
    >
      {percentage}% {passed ? "ผ่าน" : "ไม่ผ่าน"}
    </span>
  );
}

/** Collapsed by default — one card per team member got long fast; same collapse-to-a-header pattern as settings/users/users-list.tsx. */
export function EvaluationRowForm({
  userId,
  teamId,
  period,
  name,
  existing,
  editable,
  currentUserId,
  isAdmin,
}: {
  userId: string;
  teamId: string;
  period: string;
  name: string;
  existing: ExistingEvaluation | null;
  editable: boolean;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const { field } of CRITERIA) {
      initial[field] = String((existing?.[field as keyof ExistingEvaluation] as number | undefined) ?? 3);
    }
    return initial;
  });
  const [note, setNote] = useState(existing?.note ?? "");

  // One evaluation per person per month, full stop — once anyone has saved
  // it, the card locks for everyone including the original evaluator (a typo
  // fix is an admin's job, not a re-open-and-resubmit). This also covers the
  // multi-team-lead case: a member can sit under more than one lead, and
  // whoever saves first "owns" it for the month (RLS on
  // performance_evaluations backs this up server-side too — see saveEvaluation).
  const alreadyEvaluated = existing != null && !isAdmin;
  const canEdit = editable && !alreadyEvaluated;
  const isOwnSubmission = existing != null && existing.evaluator_id === currentUserId;

  const draftAverage = CRITERIA.reduce((sum, { field }) => sum + Number(scores[field]), 0) / CRITERIA.length;
  const draftPercentage = Math.round(draftAverage * 20 * 100) / 100;
  const draftPassed = draftPercentage >= 50;

  return (
    <div className="rounded-2xl border border-border/70 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <p className="min-w-0 truncate font-medium text-foreground">{name}</p>
        <div className="flex shrink-0 items-center gap-2">
          {existing ? (
            <ResultBadge percentage={existing.total_percentage} passed={existing.passed} />
          ) : (
            <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              ยังไม่ประเมิน
            </span>
          )}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 pt-3">
          {alreadyEvaluated && (
            <p className="mb-3 rounded-xl border border-border bg-accent/20 p-3 text-sm text-muted-foreground">
              {isOwnSubmission ? "คุณประเมินแล้ว" : `ประเมินแล้วโดย ${existing!.evaluator_name}`} — ดูได้อย่างเดียว
            </p>
          )}

          <ToastForm action={saveEvaluation} successTitle="บันทึกผลประเมินแล้ว" className="flex flex-col gap-3">
            <input type="hidden" name="user_id" value={userId} />
            <input type="hidden" name="team_id" value={teamId} />
            <input type="hidden" name="period" value={period} />

            {CRITERIA.map(({ field, label }) => (
              <div key={field} className="flex flex-col gap-1.5">
                <label className="text-xs text-muted-foreground">{label}</label>
                <input type="hidden" name={field} value={scores[field]} />
                <SegmentedControl
                  options={SCALE}
                  value={scores[field]}
                  onChange={(v) => setScores((s) => ({ ...s, [field]: v }))}
                  disabled={!canEdit}
                />
              </div>
            ))}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">หมายเหตุ (ไม่บังคับ)</label>
              <textarea
                name="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!canEdit}
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              />
            </div>

            {canEdit && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <ResultBadge percentage={draftPercentage} passed={draftPassed} />
                <Button type="submit" size="sm">
                  บันทึก
                </Button>
              </div>
            )}
          </ToastForm>
        </div>
      )}
    </div>
  );
}
