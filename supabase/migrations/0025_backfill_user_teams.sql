-- Defensive re-run of migration 0023's backfill. users_select's approver
-- clause (and leave_requests visibility elsewhere) checks membership via
-- user_teams, not the legacy users.team_id column — an account provisioned
-- through a code path that predates the full multi-team rollout could have
-- team_id set directly with no matching user_teams row, making that person
-- invisible to their own team's approver (shows up as "-" instead of a
-- name/email on the pending-requests card). Safe to re-run: on conflict
-- does nothing for accounts already backfilled.
insert into user_teams (user_id, team_id)
select id, team_id from users where team_id is not null
on conflict (user_id, team_id) do nothing;
