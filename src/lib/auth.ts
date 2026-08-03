import "server-only";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser } from "@/lib/supabase/types";

/** ผู้ใช้ปัจจุบัน (auth + record ในตาราง users) หรือ null ถ้ายังไม่ login / ยังไม่มี record */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .single();

  return appUser ?? null;
}

/**
 * ใช้ใน Server Component ของหน้าที่ต้อง login แล้วเท่านั้น
 * - ไม่ login -> เด้งไป /login
 * - login แล้วแต่ยังไม่มี record users (ไม่ควรเกิดขึ้น ปกติสร้างที่ /auth/callback) -> เด้งไป /login
 * - team_id ยัง null -> เด้งไปเลือกทีมก่อน (ยกเว้นหน้า onboarding เอง)
 */
export async function requireAppUser(options?: { allowNoTeam?: boolean }): Promise<AppUser> {
  const appUser = await getCurrentAppUser();

  if (!appUser) {
    redirect("/login");
  }

  if (!appUser.is_active) {
    redirect("/login?error=inactive");
  }

  if (!appUser.team_id && !options?.allowNoTeam) {
    redirect("/onboarding/team");
  }

  return appUser;
}

export async function requireAdmin(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (appUser.role !== "admin") {
    redirect("/");
  }
  return appUser;
}

export async function requireApproverOrAdmin(): Promise<AppUser> {
  const appUser = await requireAppUser();
  if (appUser.role !== "approver" && appUser.role !== "admin") {
    redirect("/");
  }
  return appUser;
}
