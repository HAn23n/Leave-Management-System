-- ============================================================================
-- Leave Management System — schema
-- Run in order: 0001_tables -> 0002_functions -> 0003_triggers ->
-- 0004_policies -> 0005_grants -> 0006_seed -> 0007_approver_visibility
-- ============================================================================

create extension if not exists "pgcrypto";

create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id         uuid primary key,                    -- = auth.users.id (Supabase auth uid)
  email      text not null,
  full_name  text not null default '',
  role       text not null default 'user'
             check (role in ('admin', 'approver', 'user')),
  team_id    uuid references teams(id) on delete restrict,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_users_team_id on users(team_id);

-- Team lead(s) per team, used to derive the approval chain
create table team_leads (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete restrict,
  user_id    uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- History of a user's team changes
create table user_team_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete restrict,
  from_team_id uuid references teams(id) on delete restrict,
  to_team_id   uuid references teams(id) on delete restrict,
  changed_at   timestamptz not null default now()
);

-- Approval-chain override for special cases (normally derived from team)
create table approver_mappings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete restrict,      -- requester
  approver_id  uuid not null references users(id) on delete restrict,      -- override approver
  created_at   timestamptz not null default now(),
  unique (user_id, approver_id)
);

create table leave_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  color      text not null default '#c81e1e',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name         text not null,
  source       text not null default 'manual' check (source in ('seed', 'manual')),
  created_at   timestamptz not null default now()
);

-- Reserved for leave quotas — not enforced by the system yet
create table leave_balances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete restrict,
  leave_type_id uuid not null references leave_types(id) on delete restrict,
  year          int not null,
  quota_days    numeric(5,1) not null default 0,
  used_days     numeric(5,1) not null default 0,
  unique (user_id, leave_type_id, year)
);

create table leave_requests (
  id             uuid primary key default gen_random_uuid(),
  request_no     text unique,                     -- auto-generated on insert (trigger)
  user_id        uuid not null references users(id) on delete restrict,
  team_id        uuid not null references teams(id) on delete restrict,
  leave_type_id  uuid not null references leave_types(id) on delete restrict,

  start_date     date not null,
  end_date       date not null,
  start_period   text not null default 'full' check (start_period in ('full', 'morning', 'afternoon')),
  end_period     text not null default 'full' check (end_period in ('full', 'morning', 'afternoon')),

  total_days     numeric(4,1),                     -- frozen at submit/approve only, never recalculated after
  reason         text not null default '',

  status         text not null default 'draft'
                 check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled', 'returned')),

  approver_id    uuid references users(id) on delete restrict,
  approver_note  text,

  submitted_at   timestamptz,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint chk_date_range check (end_date >= start_date)
);
create index idx_leave_requests_user_id on leave_requests(user_id);
create index idx_leave_requests_team_status on leave_requests(team_id, status);
create index idx_leave_requests_status on leave_requests(status);

-- Document history — written automatically on every status change (trigger)
create table leave_request_logs (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references leave_requests(id) on delete cascade,
  actor_id    uuid references users(id) on delete restrict,
  from_status text,
  to_status   text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_leave_request_logs_request_id on leave_request_logs(request_id);

-- Per-month (YYYYMM) atomic counter used to generate document numbers
create table doc_counters (
  ym      text primary key,   -- 'YYYYMM' (Gregorian/CE)
  last_no int not null default 0
);
