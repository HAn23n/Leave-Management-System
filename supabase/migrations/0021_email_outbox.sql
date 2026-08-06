-- Queues a notification email for retry when the immediate send attempt
-- fails (SMTP down, bad credentials, transient network error) — previously
-- every notify* call site just swallowed the error so the recipient would
-- never know a request needed their attention. /api/cron/retry-emails
-- sweeps this every hour and resends anything due (see lib/email-outbox.ts
-- for the 4-hour retry cadence and give-up threshold).
--
-- No RLS policies (mirrors doc_counters) — totally inaccessible to clients,
-- only the service-role (admin) client touches it.
create table email_outbox (
  id             uuid primary key default gen_random_uuid(),
  type           text not null check (type in ('new_request', 'decision')),
  to_email       text not null,
  payload        jsonb not null,
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts       int not null default 1,
  last_error     text,
  next_attempt_at timestamptz not null default (now() + interval '4 hours'),
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);
create index idx_email_outbox_retry on email_outbox (status, next_attempt_at);

alter table email_outbox enable row level security;
