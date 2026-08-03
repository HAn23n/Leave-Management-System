-- ============================================================================
-- Triggers
-- ============================================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_leave_requests_updated_at
  before update on leave_requests
  for each row execute function set_updated_at();

-- role / is_active on users can only be changed by an admin (a regular user
-- may only update their own team_id/full_name)
create or replace function guard_users_privileged_fields() returns trigger
language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth_role() is distinct from 'admin' then
    raise exception 'เฉพาะ admin เท่านั้นที่เปลี่ยน role หรือ is_active ได้';
  end if;
  return new;
end;
$$;

create trigger trg_users_guard_privileged
  before update on users
  for each row execute function guard_users_privileged_fields();

-- Blocks a team change while a pending/approved leave request exists, and
-- logs every team change into user_team_logs
create or replace function guard_and_log_team_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is distinct from old.team_id then
    if exists (
      select 1 from leave_requests
       where user_id = old.id and status in ('pending', 'approved')
    ) then
      raise exception 'ไม่สามารถเปลี่ยนทีมได้ เนื่องจากมีคำขอลาที่รออนุมัติหรืออนุมัติแล้วค้างอยู่';
    end if;

    insert into user_team_logs (user_id, from_team_id, to_team_id)
    values (old.id, old.team_id, new.team_id);
  end if;
  return new;
end;
$$;

create trigger trg_users_guard_team_change
  before update on users
  for each row execute function guard_and_log_team_change();

-- Auto-generates request_no when a new document is created (month it was created in)
create or replace function set_request_no() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.request_no is null then
    new.request_no := gen_request_no(current_date);
  end if;
  return new;
end;
$$;

create trigger trg_leave_requests_set_request_no
  before insert on leave_requests
  for each row execute function set_request_no();

-- Prevents overlapping leave (pending/approved) for the same user
create or replace function check_leave_overlap() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending', 'approved') then
    if exists (
      select 1 from leave_requests lr
       where lr.user_id = new.user_id
         and lr.id is distinct from new.id
         and lr.status in ('pending', 'approved')
         and lr.start_date <= new.end_date
         and lr.end_date >= new.start_date
    ) then
      raise exception 'มีคำขอลาที่ทับซ้อนกับช่วงวันที่นี้อยู่แล้ว';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_a_leave_requests_overlap
  before insert or update on leave_requests
  for each row execute function check_leave_overlap();

-- Freezes total_days at submit/approve time (a one-time snapshot, never recalculated later)
create or replace function freeze_total_days() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending', 'approved') and old.status in ('draft', 'returned') then
    new.total_days := calc_total_days(new.start_date, new.end_date, new.start_period, new.end_period);
    if new.status = 'pending' then
      new.submitted_at := now();
    end if;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_at := now();
  end if;

  return new;
end;
$$;

create trigger trg_b_leave_requests_freeze
  before update on leave_requests
  for each row execute function freeze_total_days();

-- Document history: writes to leave_request_logs on every create/status change
create or replace function log_leave_request_status_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.user_id);
begin
  if tg_op = 'INSERT' then
    insert into leave_request_logs (request_id, actor_id, from_status, to_status, note)
    values (new.id, v_actor, null, new.status, null);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into leave_request_logs (request_id, actor_id, from_status, to_status, note)
    values (new.id, v_actor, old.status, new.status, new.approver_note);
  end if;
  return new;
end;
$$;

create trigger trg_c_leave_requests_log
  after insert or update on leave_requests
  for each row execute function log_leave_request_status_change();
