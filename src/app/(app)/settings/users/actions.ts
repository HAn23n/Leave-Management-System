"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/types";

const VALID_ROLES: UserRole[] = ["admin", "approver", "user"];

export async function updateUserRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (!VALID_ROLES.includes(role as UserRole)) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("users").update({ role: role as UserRole }).eq("id", id);
  revalidatePath("/settings/users");
}

export async function updateUserTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const teamId = String(formData.get("team_id") || "");

  const supabase = createServerSupabaseClient();
  await supabase
    .from("users")
    .update({ team_id: teamId || null })
    .eq("id", id);
  revalidatePath("/settings/users");
}

export async function setUserActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("is_active") === "true";

  const supabase = createServerSupabaseClient();
  await supabase.from("users").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/settings/users");
}
