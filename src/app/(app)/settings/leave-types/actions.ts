"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Auto-assigned so admins never have to fuss with a color picker — the color
// still matters (used for the calendar legend and badges), just not
// something worth making a manual, fiddly-on-mobile step.
const COLOR_PALETTE = [
  "#dc2626", // red
  "#2563eb", // blue
  "#16a34a", // green
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // pink
  "#65a30d", // lime
];

export async function createLeaveType(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = createServerSupabaseClient();
  const { count } = await supabase.from("leave_types").select("id", { count: "exact", head: true });
  const color = COLOR_PALETTE[(count ?? 0) % COLOR_PALETTE.length];

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
