"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createHoliday(formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("holiday_date") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!date || !name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("holidays").insert({ holiday_date: date, name, source: "manual" });
  revalidatePath("/settings/holidays");
}

export async function deleteHoliday(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  await supabase.from("holidays").delete().eq("id", id);
  revalidatePath("/settings/holidays");
}
