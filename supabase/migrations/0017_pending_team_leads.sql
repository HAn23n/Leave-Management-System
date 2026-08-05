-- pending_user_roles was keyed by email with a single team_id, so
-- pre-assigning a not-yet-registered person as lead of a 2nd team overwrote
-- their 1st team's pending assignment. Split team assignments out into their
-- own table (one row per email+team), so a not-yet-registered person can be
-- pre-provisioned across as many teams as an already-registered one can.
create table pending_team_leads (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  team_id        uuid not null references teams(id) on delete cascade,
  approval_order int, -- null = append to the end of that team's chain at consume time
  created_at     timestamptz not null default now(),
  unique (email, team_id)
);

alter table pending_team_leads enable row level security;

create policy pending_team_leads_select_admin on pending_team_leads for select to authenticated
  using (auth_role() = 'admin');
create policy pending_team_leads_insert_admin on pending_team_leads for insert to authenticated
  with check (auth_role() = 'admin');
create policy pending_team_leads_delete_admin on pending_team_leads for delete to authenticated
  using (auth_role() = 'admin');

grant select, insert, delete on pending_team_leads to authenticated;

-- Carry forward any pending approver invite created under the old scheme
-- (pending_user_roles.team_id/approval_order) into the new table, so an
-- invite already queued before this migration still results in a real
-- team_leads row once that person logs in.
insert into pending_team_leads (email, team_id, approval_order)
select email, team_id, approval_order
from pending_user_roles
where role = 'approver' and team_id is not null
on conflict (email, team_id) do nothing;

-- approval_order on pending_user_roles is superseded by pending_team_leads;
-- team_id there now just means "home team to set on first login", unrelated
-- to which teams they lead.
alter table pending_user_roles drop column approval_order;
