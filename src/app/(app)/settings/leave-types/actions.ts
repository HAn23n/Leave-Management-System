"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createLeaveType(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#c81e1e");
  if (!name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("leave_types").insert({ name, color });
  revalidatePath("/settings/leave-types");
}

export async function setLeaveTypeActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("is_active") === "true";

  const supabase = createServerSupabaseClient();
  await supabase.from("leave_types").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/settings/leave-types");
}
