import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// สิทธิ์สูงสุด (bypass RLS) — ใช้เฉพาะใน API route handler ฝั่ง server เท่านั้น
// ห้าม import ไฟล์นี้จาก client component เด็ดขาด ("server-only" จะทำให้ build พังถ้าเผลอ import ผิดที่)
export function createAdminSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
