import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { notifyNewLeaveRequest, notifyLeaveDecision } from "@/lib/email";

type NewRequestEmailPayload = Parameters<typeof notifyNewLeaveRequest>[0];
type DecisionEmailPayload = Parameters<typeof notifyLeaveDecision>[0];

export type OutboxEmail =
  | { type: "new_request"; payload: NewRequestEmailPayload }
  | { type: "decision"; payload: DecisionEmailPayload };

// ~48h of 4-hourly retries before giving up and leaving it in email_outbox
// (status='failed') for a human to notice, rather than retrying forever.
export const MAX_ATTEMPTS = 12;
const RETRY_INTERVAL_MS = 4 * 60 * 60 * 1000;

export async function dispatchOutboxEmail(email: OutboxEmail): Promise<void> {
  if (email.type === "new_request") {
    await notifyNewLeaveRequest(email.payload);
  } else {
    await notifyLeaveDecision(email.payload);
  }
}

/**
 * Sends immediately; if that throws (SMTP down, bad credentials, transient
 * network error, etc.) queues it in email_outbox instead of silently
 * swallowing the failure, so /api/cron/retry-emails can retry every ~4h
 * until it goes through instead of the notification just being lost.
 *
 * Never throws — a notification (or queueing) failure must not roll back or
 * mask a leave-request transition that already committed. Callers rely on
 * this instead of wrapping each call in their own try/catch.
 */
export async function sendOrQueueEmail(
  admin: SupabaseClient<Database>,
  email: OutboxEmail,
  toEmail: string
): Promise<void> {
  try {
    await dispatchOutboxEmail(email);
  } catch (err) {
    try {
      await admin.from("email_outbox").insert({
        type: email.type,
        to_email: toEmail,
        payload: email.payload as unknown as Record<string, unknown>,
        status: "pending",
        attempts: 1,
        last_error: err instanceof Error ? err.message : String(err),
        next_attempt_at: new Date(Date.now() + RETRY_INTERVAL_MS).toISOString(),
      });
    } catch {
      // Queueing itself failed (DB unreachable, etc.) — nothing more we can
      // do here without risking masking the caller's already-committed change.
    }
  }
}
