-- Check-in/check-out attendance tracking. One row per user per work day;
-- "active" = check_in_at set, check_out_at still null. Worked hours are
-- computed in the app (check_out_at - check_in_at - break_hours), never
-- stored, so changing break_hours later doesn't retroactively rewrite past
-- days.
create table attendance_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete restrict,
  work_date    date not null,
  check_in_at  timestamptz,
  check_out_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, work_date)
);
create index idx_attendance_logs_user_date on attendance_logs(user_id, work_date);

alter table attendance_logs enable row level security;

create policy attendance_logs_select on attendance_logs for select to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');
create policy attendance_logs_insert_own on attendance_logs for insert to authenticated
  with check (user_id = auth.uid());
create policy attendance_logs_update_own on attendance_logs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Singleton row (id is always 1) holding the admin-configurable reminder
-- times/work hours, plus a same-day dedupe marker so the reminder cron
-- (every few minutes) sends each reminder at most once per day even though
-- it checks far more often than that.
create table attendance_settings (
  id                        int primary key default 1 check (id = 1),
  check_in_reminder_time    time not null default '08:30',
  check_out_reminder_time   time not null default '17:30',
  standard_work_hours       numeric not null default 8,
  break_hours               numeric not null default 1,
  last_check_in_reminder_date  date,
  last_check_out_reminder_date date,
  updated_at                timestamptz not null default now()
);
insert into attendance_settings (id) values (1);

alter table attendance_settings enable row level security;

create policy attendance_settings_select on attendance_settings for select to authenticated using (true);
create policy attendance_settings_update_admin on attendance_settings for update to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
