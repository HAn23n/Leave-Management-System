-- pending_user_roles.team_id was still a single value, so pre-provisioning a
-- not-yet-registered plain user across multiple teams (now supported for
-- already-registered users via user_teams) had no equivalent for someone
-- who hasn't signed in yet. Mirrors pending_team_leads: one row per
-- email+team, consumed into user_teams at first login.
create table pending_user_teams (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  team_id    uuid not null references teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (email, team_id)
);

alter table pending_user_teams enable row level security;

create policy pending_user_teams_select_admin on pending_user_teams for select to authenticated
  using (auth_role() = 'admin');
create policy pending_user_teams_insert_admin on pending_user_teams for insert to authenticated
  with check (auth_role() = 'admin');
create policy pending_user_teams_delete_admin on pending_user_teams for delete to authenticated
  using (auth_role() = 'admin');

grant select, insert, delete on pending_user_teams to authenticated;

-- Carry forward any pending invite queued under the old single-team-id scheme.
insert into pending_user_teams (email, team_id)
select email, team_id from pending_user_roles where team_id is not null
on conflict (email, team_id) do nothing;

-- Superseded by pending_user_teams — team assignment for a not-yet-registered
-- person now always goes through it, whether they'll end up role='user' or
-- get promoted to 'approver' by also having pending_team_leads rows.
alter table pending_user_roles drop column team_id;
