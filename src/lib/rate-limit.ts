import "server-only";
import { NextResponse } from "next/server";

/**
 * Minimal in-memory fixed-window rate limiter for mutating API routes.
 * Keyed per authenticated user id, not per IP (avoids punishing everyone
 * behind a shared office NAT/proxy for one person's traffic).
 *
 * This is intentionally basic: it resets on every deploy/cold start and
 * doesn't share state across serverless instances. That's an acceptable
 * trade-off for a ~20-person internal tool — it blunts accidental
 * double-submits and runaway scripts, not a determined attacker. If this
 * app ever needs real protection, replace with a shared store (e.g. Upstash
 * Redis) — the call sites won't need to change.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

const hits = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true };
}

/** Convenience wrapper for API routes: returns a 429 response to short-circuit on, or null to proceed. */
export function rateLimitResponse(key: string): NextResponse | null {
  const result = checkRateLimit(key);
  if (result.allowed) return null;
  return NextResponse.json(
    { error: "rate_limited" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) } }
  );
}
