import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { dispatchOutboxEmail, MAX_ATTEMPTS, type OutboxEmail } from "@/lib/email-outbox";

/**
 * Runs hourly (see vercel.json) and resends anything in email_outbox whose
 * next_attempt_at has passed — a failed send gets requeued another 4h out
 * (see lib/email-outbox.ts), so this doesn't need to run more often than
 * that; hourly just keeps the actual resend close to the 4h target instead
 * of drifting a whole cron period late.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  const { data: due } = await admin
    .from("email_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(50);

  let sent = 0;
  let retried = 0;
  let gaveUp = 0;

  for (const row of due ?? []) {
    try {
      await dispatchOutboxEmail({ type: row.type, payload: row.payload } as OutboxEmail);
      await admin
        .from("email_outbox")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      await admin
        .from("email_outbox")
        .update({
          attempts,
          last_error: err instanceof Error ? err.message : String(err),
          status: giveUp ? "failed" : "pending",
          next_attempt_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", row.id);
      giveUp ? gaveUp++ : retried++;
    }
  }

  return NextResponse.json({ checked: (due ?? []).length, sent, retried, gaveUp });
}
