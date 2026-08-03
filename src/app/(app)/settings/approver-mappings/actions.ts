"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createApproverMapping(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const approverId = String(formData.get("approver_id") ?? "");
  if (!userId || !approverId || userId === approverId) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("approver_mappings").insert({ user_id: userId, approver_id: approverId });
  revalidatePath("/settings/approver-mappings");
}

export async function deleteApproverMapping(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  await supabase.from("approver_mappings").delete().eq("id", id);
  revalidatePath("/settings/approver-mappings");
}
