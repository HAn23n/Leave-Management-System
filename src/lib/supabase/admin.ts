import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Elevated privilege client (bypasses RLS) — server-side API route handlers only.
// Never import this from a client component; "server-only" will break the build if you do.
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
