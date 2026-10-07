"use server";

import { revalidatePath } from "next/cache";
import { requireApproverOrAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isEvaluationPeriodEditable } from "@/lib/date";
import { safeDbErrorMessage } from "@/lib/db-error";

const CRITERIA_FIELDS = [
  "score_punctuality",
  "score_responsibility",
  "score_achievement",
  "score_delivery",
  "score_skill",
] as const;

export async function saveEvaluation(formData: FormData) {
  const appUser = await requireApproverOrAdmin();

  const userId = String(formData.get("user_id") ?? "");
  const teamId = String(formData.get("team_id") ?? "");
  const period = String(formData.get("period") ?? "");
  if (!userId || !teamId || !period) throw new Error("ข้อมูลไม่ครบถ้วน");

  // Client-side already hides/disables the form for a future period — this
  // is the authoritative check. Admin can always fill in ahead of time too.
  if (appUser.role !== "admin" && !isEvaluationPeriodEditable(period)) {
    throw new Error("ยังไม่ถึงเดือนนี้ ประเมินได้เมื่อเดือนนี้เริ่มแล้ว");
  }

  const scores: Record<string, number> = {};
  for (const field of CRITERIA_FIELDS) {
    const value = Number(formData.get(field));
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error("คะแนนแต่ละหัวข้อต้องอยู่ระหว่าง 1-5");
    }
    scores[field] = value;
  }
  const note = String(formData.get("note") ?? "").trim();

  // One evaluation per person per month — once anyone has saved it, it's
  // locked even for the original evaluator (no re-open-and-resubmit; a
  // correction after the fact is an admin's job). The UI already hides the
  // form once one exists, but that's a snapshot from page load, so re-check
  // here against the current row (via the admin client — a non-admin
  // evaluator's own session can't see another evaluator's row, see
  // lib/evaluations.ts) to catch a race between two saves at nearly the
  // same time, including a duplicate double-click of the same lead's own.
  if (appUser.role !== "admin") {
    const { data: current } = await createAdminSupabaseClient()
      .from("performance_evaluations")
      .select("id")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();
    if (current) {
      throw new Error("ประเมินไปแล้ว ไม่สามารถแก้ไขได้อีก");
    }
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("performance_evaluations")
    .upsert(
      {
        user_id: userId,
        team_id: teamId,
        evaluator_id: appUser.id,
        period,
        note: note || null,
        ...scores,
      },
      { onConflict: "user_id,period" }
    )
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(safeDbErrorMessage(error, "บันทึกผลประเมินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"));
  }
  if (!data) {
    // RLS silently dropped an ON CONFLICT DO UPDATE that didn't satisfy the
    // update policy (evaluator_id mismatch) — same race as above, just lost it.
    throw new Error("ประเมินไปแล้ว ไม่สามารถแก้ไขได้อีก");
  }

  revalidatePath("/evaluations");
}
