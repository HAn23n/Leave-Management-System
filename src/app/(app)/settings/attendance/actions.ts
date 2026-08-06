"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function updateAttendanceSettings(formData: FormData) {
  await requireAdmin();

  const checkInTime = String(formData.get("check_in_reminder_time") || "08:30");
  const checkOutTime = String(formData.get("check_out_reminder_time") || "17:30");
  const workHours = Number(formData.get("standard_work_hours"));
  const breakHours = Number(formData.get("break_hours"));

  if (!/^\d{2}:\d{2}$/.test(checkInTime) || !/^\d{2}:\d{2}$/.test(checkOutTime)) return;
  if (!Number.isFinite(workHours) || workHours <= 0) return;
  if (!Number.isFinite(breakHours) || breakHours < 0) return;

  const supabase = createServerSupabaseClient();
  await supabase
    .from("attendance_settings")
    .update({
      check_in_reminder_time: checkInTime,
      check_out_reminder_time: checkOutTime,
      standard_work_hours: workHours,
      break_hours: breakHours,
    })
    .eq("id", 1);

  revalidatePath("/settings/attendance");
}
