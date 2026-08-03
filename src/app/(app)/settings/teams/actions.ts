"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").insert({ name });
  revalidatePath("/settings/teams");
}

export async function setTeamActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("is_active") === "true";

  const supabase = createServerSupabaseClient();
  await supabase.from("teams").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/settings/teams");
}

export async function addTeamLead(formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("team_id"));
  const userId = String(formData.get("user_id"));
  if (!userId) return;

  const supabase = createServerSupabaseClient();
  // ignoreDuplicates: re-adding an existing lead (team_id, user_id) is a
  // harmless no-op instead of a swallowed unique-violation error.
  await supabase
    .from("team_leads")
    .upsert({ team_id: teamId, user_id: userId }, { onConflict: "team_id,user_id", ignoreDuplicates: true });
  revalidatePath("/settings/teams");
}

export async function removeTeamLead(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));

  const supabase = createServerSupabaseClient();
  await supabase.from("team_leads").delete().eq("id", id);
  revalidatePath("/settings/teams");
}
