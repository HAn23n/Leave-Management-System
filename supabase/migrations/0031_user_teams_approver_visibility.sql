-- user_teams SELECT only ever let a user see their own membership row (see
-- 0023_multi_team_membership.sql: `user_id = auth.uid() or admin`). Every
-- policy elsewhere that joins through user_teams to check "is this person on
-- a team I lead" — performance_evaluations insert/update (0030) being the
-- one that surfaced it — has its own user_teams subquery silently filtered
-- down to nothing for anyone but the row's own owner, since RLS applies to
-- a table's rows regardless of where the query against it originates (a
-- subquery inside another table's policy is no exception). Widening
-- user_teams' own SELECT policy to also cover an approver's led teams closes
-- that gap at its source, same open scope team_leads_select already has.
create policy user_teams_select_approver on user_teams for select to authenticated
  using (
    team_id in (select team_id from team_leads where user_id = auth.uid())
  );
