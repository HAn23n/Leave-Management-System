-- Sequential multi-level approval: team_leads gains an explicit order
-- (1 = first approver, 2 = second, ...), and leave_requests tracks which
-- level is currently pending. A request only reaches 'approved' once every
-- level in the team's chain has signed off, in order.

alter table team_leads add column approval_order int;

-- Backfill existing rows with a stable per-team order (by when they were
-- added) before the column becomes NOT NULL + uniquely constrained.
with ordered as (
  select id, row_number() over (partition by team_id order by created_at) as rn
  from team_leads
)
update team_leads tl
set approval_order = ordered.rn
from ordered
where tl.id = ordered.id;

alter table team_leads alter column approval_order set not null;
alter table team_leads alter column approval_order set default 1;
alter table team_leads add constraint uq_team_leads_team_order unique (team_id, approval_order);

alter table leave_requests add column current_level int not null default 1;

-- Close a gap the new column opens in the existing field-ownership guard
-- (0008_leave_request_field_guard_and_mapped_approver.sql): without this,
-- leave_requests_update_own would let the requester themselves PATCH
-- current_level directly (e.g. jump straight to the last level) and skip
-- the chain entirely. Only an approver (acting through decideOnPendingRequest)
-- or an admin may move it.
create or replace function guard_leave_request_field_ownership() returns trigger
language plpgsql as $$
begin
  if auth_role() = 'admin' then
    return new;
  end if;

  if new.team_id is distinct from old.team_id
     or new.request_no is distinct from old.request_no
     or new.total_days is distinct from old.total_days
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at then
    raise exception 'ไม่สามารถแก้ไขข้อมูลส่วนนี้ได้โดยตรง';
  end if;

  if new.current_level is distinct from old.current_level and auth_role() <> 'approver' then
    raise exception 'ไม่สามารถแก้ไขลำดับการอนุมัติได้โดยตรง';
  end if;

  if new.approver_id is distinct from old.approver_id
     and new.approver_id is not null
     and new.approver_id is distinct from auth.uid() then
    raise exception 'ไม่สามารถกำหนดผู้อนุมัติเป็นผู้อื่นได้';
  end if;

  if new.approver_note is distinct from old.approver_note
     and new.user_id = auth.uid()
     and new.approver_note is not null then
    raise exception 'ไม่สามารถแก้ไขหมายเหตุของผู้อนุมัติได้';
  end if;

  return new;
end;
$$;
