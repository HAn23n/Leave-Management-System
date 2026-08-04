import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Only plain `RAISE EXCEPTION 'text'` (Postgres gives it SQLSTATE P0001) is
 * one of our own hand-written, already-Thai, user-facing trigger messages
 * (the overlap check, the field-ownership guard, etc). Any other Postgres
 * error — an RLS denial, a constraint violation, anything else — could
 * expose table/column/constraint names, so it gets a generic fallback
 * instead of being echoed back to the client.
 */
export function safeDbErrorMessage(
  error: PostgrestError,
  fallback = "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
): string {
  return error.code === "P0001" ? error.message : fallback;
}
