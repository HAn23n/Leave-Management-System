-- Walks back the team-wide "see the whole team's leave records" visibility
-- that migration 0023 gave every plain team member: that was found to leak
-- teammates' still-private drafts through the search page and report export,
-- and the detail page was never updated to let a plain user actually open a
-- teammate's request anyway. A plain user should only ever see their own
-- leave_requests rows; approvers/admins keep their existing team_leads-based
-- visibility untouched.
drop policy leave_requests_select on leave_requests;
create policy leave_requests_select on leave_requests for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (
      auth_role() = 'approver'
      and team_id in (select team_id from team_leads where user_id = auth.uid())
    )
  );

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
           or exists (
             select 1 from approver_mappings am
              where am.user_id = lr.user_id and am.approver_id = auth.uid()
           )
         )
    )
  );

-- Records which chain level a log entry belongs to, so the leave report can
-- show who *actually* approved each level historically instead of whoever
-- the team's approval chain happens to be configured with today (the two
-- drift apart the moment a team's chain is edited after a request was
-- already decided). Populated going forward only — logs written before this
-- migration have level = null and simply won't populate a report column for
-- that (already-decided) historical request.
alter table leave_request_logs add column level int;

create or replace function log_leave_request_status_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.user_id);
begin
  if tg_op = 'INSERT' then
    insert into leave_request_logs (request_id, actor_id, from_status, to_status, note, level)
    values (new.id, v_actor, null, new.status, null, new.current_level);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into leave_request_logs (request_id, actor_id, from_status, to_status, note, level)
    values (new.id, v_actor, old.status, new.status, new.approver_note, new.current_level);
  end if;
  return new;
end;
$$;

-- Defensive backfill, same shape as 0025: any account made a team_leads
-- approver without ever getting a matching user_teams row (the code paths
-- that could produce this are fixed alongside this migration, but existing
-- affected rows need a one-time catch-up) is invisible to co-approvers and
-- to itself under users_select — showing up as "-" wherever their name
-- should render.
insert into user_teams (user_id, team_id)
select distinct tl.user_id, tl.team_id
from team_leads tl
where not exists (
  select 1 from user_teams ut where ut.user_id = tl.user_id and ut.team_id = tl.team_id
)
on conflict do nothing;
