-- A plain employee (not just an approver) can now belong to more than one
-- team at once. user_teams is the authoritative membership list; users.team_id
-- becomes a derived "primary/default" value (auto-kept in sync below) so every
-- existing read of appUser.team_id — onboarding gate, dashboard, reports
-- default, profile display — keeps working unchanged.
create table user_teams (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete restrict,
  team_id    uuid not null references teams(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, team_id)
);
create index idx_user_teams_user on user_teams(user_id);
create index idx_user_teams_team on user_teams(team_id);

alter table user_teams enable row level security;

create policy user_teams_select on user_teams for select to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');
create policy user_teams_insert on user_teams for insert to authenticated
  with check (user_id = auth.uid() or auth_role() = 'admin');
create policy user_teams_delete on user_teams for delete to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');

-- Backfill: everyone's current single team_id becomes their first membership.
insert into user_teams (user_id, team_id)
select id, team_id from users where team_id is not null
on conflict (user_id, team_id) do nothing;

-- Keeps users.team_id pointing at *a* current membership without ever being
-- the source of truth itself: gaining a first team sets it (never overwrites
-- an existing value — adding a 2nd/3rd team shouldn't reshuffle which one is
-- "primary"), losing the membership it was pointing at reassigns it to
-- whatever's left, and losing the last one clears it back to null (same
-- state as before ever picking a team, so the onboarding gate re-applies).
create or replace function sync_user_home_team() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update users set team_id = new.team_id where id = new.user_id and team_id is null;
  elsif tg_op = 'DELETE' then
    if exists (select 1 from users where id = old.user_id and team_id = old.team_id) then
      update users set team_id = (
        select team_id from user_teams where user_id = old.user_id order by created_at limit 1
      ) where id = old.user_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_user_teams_sync_home
  after insert or delete on user_teams
  for each row execute function sync_user_home_team();

-- Requested removal: filing a leave request no longer has to fully resolve
-- before the person can change/add teams. Logging to user_team_logs stays.
create or replace function guard_and_log_team_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is distinct from old.team_id then
    insert into user_team_logs (user_id, from_team_id, to_team_id)
    values (old.id, old.team_id, new.team_id);
  end if;
  return new;
end;
$$;

-- A leave request may now be filed under any team the requester belongs to,
-- not only their (single, auto-synced) primary team.
drop policy leave_requests_insert_own on leave_requests;
create policy leave_requests_insert_own on leave_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'draft'
    and team_id in (select team_id from user_teams where user_id = auth.uid())
  );

-- A team member can now see the whole team's leave records, not just their
-- own — mirrors what an approver already sees for teams they lead.
drop policy leave_requests_select on leave_requests;
create policy leave_requests_select on leave_requests for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (
      auth_role() = 'approver'
      and team_id in (select team_id from team_leads where user_id = auth.uid())
    )
    or team_id in (select team_id from user_teams where user_id = auth.uid())
  );

-- Same extension for the document history, plus a pre-existing gap fixed in
-- passing: the approver clause here was never updated when multi-team
-- approvers (migration 0016) moved leave_requests_select off auth_team_id()
-- and onto team_leads — an approver leading a team other than their own
-- home team could see/act on its requests but not their log history.
drop policy leave_request_logs_select on leave_request_logs;
create policy leave_request_logs_select on leave_request_logs for select to authenticated
  using (
    exists (
      select 1 from leave_requests lr
       where lr.id = leave_request_logs.request_id
         and (
           lr.user_id = auth.uid()
           or auth_role() = 'admin'
           or (
             auth_role() = 'approver'
             and lr.team_id in (select team_id from team_leads where user_id = auth.uid())
           )
           or lr.team_id in (select team_id from user_teams where user_id = auth.uid())
           or exists (
             select 1 from approver_mappings am
              where am.user_id = lr.user_id and am.approver_id = auth.uid()
           )
         )
    )
  );

-- A member can now look up a teammate's profile (email) for anywhere the app
-- needs to show "who" alongside a shared team's leave records — checked
-- against the full user_teams membership set, not the single team_id column
-- (which only ever reflects one of possibly several teams).
drop policy users_select on users;
create policy users_select on users for select to authenticated
  using (
    id = auth.uid()
    or auth_role() = 'admin'
    or (
      auth_role() = 'approver'
      and exists (
        select 1 from user_teams ut
         where ut.user_id = users.id
           and ut.team_id in (select team_id from team_leads where user_id = auth.uid())
      )
    )
    or exists (
      select 1 from user_teams ut
       where ut.user_id = users.id
         and ut.team_id in (select team_id from user_teams where user_id = auth.uid())
    )
  );
