-- One-click approve/reject from the notification email, without logging
-- into the web app first. A token is minted whenever an approver becomes
-- "current" on a request (first submit, or advancing to the next chain
-- level) and mailed as a link to a safe confirmation page (see
-- /approve/[token]) that only mutates on an explicit POST — never on the
-- GET itself, so email link-prescanners can't auto-trigger a decision.
--
-- Only the SHA-256 hash is stored (same principle as a password) — the raw
-- token exists only in the outbound email. No RLS policies for
-- `authenticated`: this table is only ever touched via the service-role
-- (admin) client from server routes, same as leave_request_logs.
create table approval_tokens (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references leave_requests(id) on delete cascade,
  approver_id  uuid not null references users(id) on delete cascade,
  level        int not null,
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index idx_approval_tokens_request on approval_tokens(request_id);

alter table approval_tokens enable row level security;
