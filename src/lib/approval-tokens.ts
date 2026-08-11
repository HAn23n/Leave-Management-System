import "server-only";
import { randomBytes, createHash } from "crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Mints a one-click approve/reject token for a request's currently-notified
 * approver. Only the SHA-256 hash is stored — the raw token exists solely in
 * the outbound email link, same principle as never storing a plaintext
 * password.
 */
export async function createApprovalToken(params: {
  requestId: string;
  approverId: string;
  level: number;
}): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const admin = createAdminSupabaseClient();
  await admin.from("approval_tokens").insert({
    request_id: params.requestId,
    approver_id: params.approverId,
    level: params.level,
    token_hash: hashToken(raw),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  return raw;
}

export interface ApprovalTokenSummary {
  requestId: string;
  approverId: string;
  requestNo: string | null;
  requesterEmail: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number | null;
  reason: string;
}

/**
 * Read-only lookup for rendering the confirmation page — never mutates
 * `used_at`, so simply visiting the link (including an email client's
 * link-prescanner fetching it) has no side effect.
 */
export async function peekApprovalToken(raw: string): Promise<ApprovalTokenSummary | null> {
  const admin = createAdminSupabaseClient();
  const hash = hashToken(raw);
  const { data: token } = await admin
    .from("approval_tokens")
    .select("request_id, approver_id, used_at, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!token || token.used_at || new Date(token.expires_at) < new Date()) return null;

  const { data: request } = await admin
    .from("leave_requests")
    .select("id, request_no, user_id, leave_type_id, start_date, end_date, total_days, reason, status, current_level")
    .eq("id", token.request_id)
    .maybeSingle();
  if (!request) return null;

  const [{ data: requester }, { data: leaveType }] = await Promise.all([
    admin.from("users").select("email").eq("id", request.user_id).maybeSingle(),
    admin.from("leave_types").select("name").eq("id", request.leave_type_id).maybeSingle(),
  ]);

  return {
    requestId: request.id,
    approverId: token.approver_id,
    requestNo: request.request_no,
    requesterEmail: requester?.email ?? "",
    leaveTypeName: leaveType?.name ?? "",
    startDate: request.start_date,
    endDate: request.end_date,
    totalDays: request.total_days,
    reason: request.reason,
  };
}

/** Single-use: resolves the token to its request/approver, then the caller must mark it used on success. */
export async function consumeApprovalToken(
  raw: string
): Promise<{ id: string; requestId: string; approverId: string } | null> {
  const admin = createAdminSupabaseClient();
  const hash = hashToken(raw);
  const { data: token } = await admin
    .from("approval_tokens")
    .select("id, request_id, approver_id, used_at, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (!token || token.used_at || new Date(token.expires_at) < new Date()) return null;
  return { id: token.id, requestId: token.request_id, approverId: token.approver_id };
}

export async function markApprovalTokenUsed(id: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  await admin.from("approval_tokens").update({ used_at: new Date().toISOString() }).eq("id", id);
}
