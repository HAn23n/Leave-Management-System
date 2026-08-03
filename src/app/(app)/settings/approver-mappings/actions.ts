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
  // ignoreDuplicates: re-adding an existing (user_id, approver_id) override
  // is a harmless no-op instead of a swallowed unique-violation error.
  await supabase
    .from("approver_mappings")
    .upsert(
      { user_id: userId, approver_id: approverId },
      { onConflict: "user_id,approver_id", ignoreDuplicates: true }
    );
  revalidatePath("/settings/approver-mappings");
}

export async function deleteApproverMapping(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  await supabase.from("approver_mappings").delete().eq("id", id);
  revalidatePath("/settings/approver-mappings");
}
