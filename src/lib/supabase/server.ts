import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// ใช้ anon key + cookie ของ user ที่ login อยู่ — RLS ยังบังคับใช้ตามปกติ
// (ไม่ใช่ client สิทธิ์สูงสุด ใช้ใน Server Component / Route Handler ทั่วไป)
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // เรียกจาก Server Component ที่ set cookie ไม่ได้ (ไม่เป็นไร มี middleware refresh session ให้)
          }
        },
      },
    }
  );
}
