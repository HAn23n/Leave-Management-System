-- ============================================================================
-- ระบบบันทึกการลา (Leave Management System) — Initial schema
-- ทำก่อนเสมอ: ตาราง + RLS + functions + triggers + seed data
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

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

-- หัวหน้าของแต่ละทีม ใช้ derive สายอนุมัติ
create table team_leads (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete restrict,
  user_id    uuid not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ประวัติเปลี่ยนทีมของ user
create table user_team_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete restrict,
  from_team_id uuid references teams(id) on delete restrict,
  to_team_id   uuid references teams(id) on delete restrict,
  changed_at   timestamptz not null default now()
);

-- override สายอนุมัติกรณีพิเศษ (ปกติ derive จากทีม)
create table approver_mappings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete restrict,      -- ผู้ขอ
  approver_id  uuid not null references users(id) on delete restrict,      -- ผู้อนุมัติ override
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

-- เตรียมไว้สำหรับโควตาการลา — ยังไม่ enforce ในระบบตอนนี้
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
  request_no     text unique,                     -- gen อัตโนมัติตอน insert (trigger)
  user_id        uuid not null references users(id) on delete restrict,
  team_id        uuid not null references teams(id) on delete restrict,
  leave_type_id  uuid not null references leave_types(id) on delete restrict,

  start_date     date not null,
  end_date       date not null,
  start_period   text not null default 'full' check (start_period in ('full', 'morning', 'afternoon')),
  end_period     text not null default 'full' check (end_period in ('full', 'morning', 'afternoon')),

  total_days     numeric(4,1),                     -- freeze ตอน submit/approve เท่านั้น ไม่คำนวณใหม่อัตโนมัติ
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

-- document history — เขียนอัตโนมัติทุกครั้งที่ status เปลี่ยน (trigger)
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

-- ตัว counter สำหรับ gen เลขเอกสารแบบ atomic ต่อเดือน (YYYYMM)
create table doc_counters (
  ym      text primary key,   -- 'YYYYMM' (ค.ศ.)
  last_no int not null default 0
);

-- ============================================================================
-- 2. HELPER FUNCTIONS (SECURITY DEFINER, ใช้อ่าน role/team ของ auth.uid()
--    เพื่อเลี่ยง recursive RLS เวลาอ้างอิงตาราง users ในนโยบายของ users เอง)
-- ============================================================================

create or replace function auth_role() returns text
language sql security definer stable
set search_path = public
as $$
  select role from users where id = auth.uid();
$$;

create or replace function auth_team_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select team_id from users where id = auth.uid();
$$;

-- ============================================================================
-- 3. BUSINESS FUNCTIONS
-- ============================================================================

-- คำนวณจำนวนวันลา: นับเฉพาะ จ.-ศ. ตัดวันใน holidays, อิงเวลาไทย, ครึ่งวัน = 0.5
create or replace function calc_total_days(
  p_start        date,
  p_end          date,
  p_start_period text,
  p_end_period   text
) returns numeric(4,1)
language plpgsql
stable
as $$
declare
  v_total  numeric := 0;
  v_day    date := p_start;
  v_is_biz boolean;
begin
  if p_start > p_end then
    return 0;
  end if;

  while v_day <= p_end loop
    v_is_biz := extract(isodow from v_day) < 6
      and not exists (select 1 from holidays h where h.holiday_date = v_day);

    if v_is_biz then
      if v_day = p_start and v_day = p_end then
        if p_start_period = 'full' and p_end_period = 'full' then
          v_total := v_total + 1;
        else
          v_total := v_total + 0.5;
        end if;
      elsif v_day = p_start then
        v_total := v_total + (case when p_start_period = 'full' then 1 else 0.5 end);
      elsif v_day = p_end then
        v_total := v_total + (case when p_end_period = 'full' then 1 else 0.5 end);
      else
        v_total := v_total + 1;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_total;
end;
$$;
grant execute on function calc_total_days(date, date, text, text) to authenticated;

-- gen เลขเอกสารแบบ atomic: ตาราง counter ต่อเดือน + FOR UPDATE (ห้ามใช้ COUNT(*)+1)
create or replace function gen_request_no(p_date date default current_date) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym   text := to_char(p_date, 'YYYYMM');
  v_next int;
begin
  insert into doc_counters (ym, last_no) values (v_ym, 0)
    on conflict (ym) do nothing;

  perform 1 from doc_counters where ym = v_ym for update;

  update doc_counters
     set last_no = last_no + 1
   where ym = v_ym
  returning last_no into v_next;

  -- รองรับเกิน 999: ใช้ความยาวขั้นต่ำ 3 หลัก แต่ไม่ error ถ้าเกิน (lpad ไม่ตัดทอนตัวเลขที่ยาวกว่า)
  return v_ym || lpad(v_next::text, 3, '0');
end;
$$;

-- ============================================================================
-- 4. TRIGGERS
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

-- role / is_active ของ users แก้ได้เฉพาะ admin (user แก้ได้แค่ team_id/full_name ของตัวเอง)
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

-- ห้ามเปลี่ยนทีมถ้ามีคำขอลา pending/approved ค้างอยู่, และบันทึกทุกการเปลี่ยนทีมลง user_team_logs
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

-- gen request_no อัตโนมัติตอนสร้างเอกสารใหม่ (ยึดเดือนที่สร้าง)
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

-- กันการลาซ้อนทับ (overlap) กับคำขอสถานะ pending/approved ของ user เดียวกัน
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

-- freeze total_days ตอน submit/approve (snapshot ครั้งเดียว ไม่คำนวณใหม่ทีหลัง)
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

-- document history: เขียน leave_request_logs ทุกครั้งที่สร้างเอกสาร/เปลี่ยนสถานะ
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

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

alter table teams enable row level security;
alter table users enable row level security;
alter table team_leads enable row level security;
alter table user_team_logs enable row level security;
alter table approver_mappings enable row level security;
alter table leave_types enable row level security;
alter table holidays enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table leave_request_logs enable row level security;
alter table doc_counters enable row level security;   -- ไม่มี policy = client แตะไม่ได้เลย เข้าผ่าน SECURITY DEFINER function เท่านั้น

-- teams: อ่านได้ทุกคนที่ login แล้ว (ต้องเลือกทีมตอน onboarding), แก้ได้เฉพาะ admin
create policy teams_select on teams for select to authenticated using (true);
create policy teams_write_admin on teams for insert to authenticated with check (auth_role() = 'admin');
create policy teams_update_admin on teams for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- users: เห็นตัวเอง / approver เห็นทีมตัวเอง / admin เห็นหมด
create policy users_select on users for select to authenticated
  using (id = auth.uid() or auth_role() = 'admin' or (auth_role() = 'approver' and team_id = auth_team_id()));

-- กัน privilege escalation: self-insert (สร้าง record ตอน login ครั้งแรก) ต้องเป็น role='user'
-- และ is_active=true เท่านั้น ห้าม client ตั้งตัวเองเป็น admin/approver ตอนสมัคร
create policy users_insert_self on users for insert to authenticated
  with check (id = auth.uid() and role = 'user' and is_active = true);

-- update: เจ้าของแก้ข้อมูลตัวเอง (role/is_active ถูกกันด้วย trigger ด้านบน) หรือ admin แก้ใครก็ได้
create policy users_update_self on users for update to authenticated
  using (id = auth.uid() or auth_role() = 'admin')
  with check (id = auth.uid() or auth_role() = 'admin');

-- team_leads: อ่านได้ทุกคน (ใช้ derive สายอนุมัติ), เขียนได้เฉพาะ admin
create policy team_leads_select on team_leads for select to authenticated using (true);
create policy team_leads_insert_admin on team_leads for insert to authenticated with check (auth_role() = 'admin');
create policy team_leads_update_admin on team_leads for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy team_leads_delete_admin on team_leads for delete to authenticated using (auth_role() = 'admin');

-- user_team_logs: เจ้าของอ่าน log ตัวเอง, admin อ่านหมด, insert ทำผ่าน API (service role) เท่านั้น
create policy user_team_logs_select on user_team_logs for select to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');

-- approver_mappings: admin จัดการ, user/approver ที่เกี่ยวข้องอ่านได้
create policy approver_mappings_select on approver_mappings for select to authenticated
  using (user_id = auth.uid() or approver_id = auth.uid() or auth_role() = 'admin');
create policy approver_mappings_write_admin on approver_mappings for insert to authenticated with check (auth_role() = 'admin');
create policy approver_mappings_update_admin on approver_mappings for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy approver_mappings_delete_admin on approver_mappings for delete to authenticated using (auth_role() = 'admin');

-- leave_types: อ่านได้ทุกคน, เขียนได้เฉพาะ admin (soft delete ผ่าน update is_active)
create policy leave_types_select on leave_types for select to authenticated using (true);
create policy leave_types_insert_admin on leave_types for insert to authenticated with check (auth_role() = 'admin');
create policy leave_types_update_admin on leave_types for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- holidays: อ่านได้ทุกคน, เขียนได้เฉพาะ admin
create policy holidays_select on holidays for select to authenticated using (true);
create policy holidays_insert_admin on holidays for insert to authenticated with check (auth_role() = 'admin');
create policy holidays_update_admin on holidays for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy holidays_delete_admin on holidays for delete to authenticated using (auth_role() = 'admin');

-- leave_balances: เจ้าของอ่านของตัวเอง, approver อ่านทีม, admin จัดการทั้งหมด (ยังไม่ enforce การใช้งานจริง)
create policy leave_balances_select on leave_balances for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (auth_role() = 'approver' and user_id in (select id from users where team_id = auth_team_id()))
  );
create policy leave_balances_write_admin on leave_balances for insert to authenticated with check (auth_role() = 'admin');
create policy leave_balances_update_admin on leave_balances for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- leave_requests: หัวใจของระบบ — scope ตาม role ที่ระดับ DB
create policy leave_requests_select on leave_requests for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (auth_role() = 'approver' and team_id = auth_team_id())
  );

-- insert ใหม่ต้องเป็น draft เสมอ (แม้ approver ขอลาเอง ก็สร้างเป็น draft ก่อน
-- แล้วค่อย update ไป approved ในขั้นถัดไปผ่าน leave_requests_update_approver policy)
create policy leave_requests_insert_own on leave_requests for insert to authenticated
  with check (user_id = auth.uid() and team_id = auth_team_id() and status = 'draft');

-- เจ้าของแก้ได้เฉพาะตอน draft/returned/pending (แก้ไขก่อนอนุมัติ, ส่งอนุมัติ, หรือยกเลิก)
-- WITH CHECK จำกัดปลายทางสถานะไว้ที่ draft/pending/cancelled เท่านั้น — ห้าม user ตั้งสถานะ
-- approved/rejected/returned ให้ตัวเอง (ต้องผ่าน policy ของ approver/admin เท่านั้น)
create policy leave_requests_update_own on leave_requests for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned', 'pending'))
  with check (user_id = auth.uid() and status in ('draft', 'pending', 'cancelled'));

-- approver แก้ (อนุมัติ/ไม่อนุมัติ/ส่งคืน) คำขอในทีมตัวเองได้
create policy leave_requests_update_approver on leave_requests for update to authenticated
  using (auth_role() = 'approver' and team_id = auth_team_id())
  with check (auth_role() = 'approver' and team_id = auth_team_id());

create policy leave_requests_update_admin on leave_requests for update to authenticated
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- leave_request_logs: อ่านได้ตาม scope เดียวกับ leave_requests ที่อ้างอิง, เขียนได้เฉพาะ trigger (SECURITY DEFINER)
create policy leave_request_logs_select on leave_request_logs for select to authenticated
  using (
    exists (
      select 1 from leave_requests lr
       where lr.id = leave_request_logs.request_id
         and (
           lr.user_id = auth.uid()
           or auth_role() = 'admin'
           or (auth_role() = 'approver' and lr.team_id = auth_team_id())
         )
    )
  );

-- ============================================================================
-- 6. GRANTS (RLS จำกัด "แถวไหน" เห็นได้ แต่ต้อง grant สิทธิ์ระดับตาราง/คอลัมน์ด้วย)
-- ============================================================================

grant usage on schema public to authenticated;
grant select, insert, update on
  teams, users, team_leads, user_team_logs, approver_mappings,
  leave_types, holidays, leave_balances, leave_requests, leave_request_logs
  to authenticated;
-- doc_counters: ไม่ grant ให้ authenticated เลย เข้าถึงผ่าน SECURITY DEFINER function เท่านั้น

-- ============================================================================
-- 7. SEED DATA
-- ============================================================================

insert into teams (name) values ('ทีม A');

insert into leave_types (name, color) values
  ('ลาป่วย', '#dc2626'),
  ('ลากิจ', '#2563eb'),
  ('ลาพักร้อน', '#16a34a');

-- วันหยุดนักขัตฤกษ์ไทย 2026 — เฉพาะวันหยุดที่วันที่คงที่ทุกปี (แน่นอน)
-- วันหยุดทางพุทธศาสนา (มาฆบูชา/วิสาขบูชา/อาสาฬหบูชา/เข้าพรรษา) และวันหยุดชดเชย
-- เปลี่ยนวันที่ทุกปีตามจันทรคติ/ประกาศคณะรัฐมนตรี — ให้ admin เพิ่มเองผ่านหน้า Settings
-- หลังยืนยันวันที่จริงจากราชกิจจานุเบกษา (source = 'manual')
insert into holidays (holiday_date, name, source) values
  ('2026-01-01', 'วันขึ้นปีใหม่', 'seed'),
  ('2026-04-06', 'วันจักรี', 'seed'),
  ('2026-04-13', 'วันสงกรานต์', 'seed'),
  ('2026-04-14', 'วันสงกรานต์', 'seed'),
  ('2026-04-15', 'วันสงกรานต์', 'seed'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ', 'seed'),
  ('2026-05-04', 'วันฉัตรมงคล', 'seed'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10', 'seed'),
  ('2026-08-12', 'วันแม่แห่งชาติ', 'seed'),
  ('2026-10-13', 'วันคล้ายวันสวรรคต ร.9', 'seed'),
  ('2026-10-23', 'วันปิยมหาราช', 'seed'),
  ('2026-12-05', 'วันพ่อแห่งชาติ / วันคล้ายวันเฉลิมพระชนมพรรษา ร.9', 'seed'),
  ('2026-12-10', 'วันรัฐธรรมนูญ', 'seed'),
  ('2026-12-31', 'วันสิ้นปี', 'seed');
