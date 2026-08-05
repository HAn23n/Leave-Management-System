-- An approver can now lead more than one team (team_leads already allowed
-- multiple rows per user_id — nothing enforced one-only at the schema
-- level). What actually capped it at one team was RLS: every
-- approver-scoped policy checked team_id = auth_team_id() (the approver's
-- own single users.team_id), not team_leads membership. Extend each to
-- check team_leads instead, so an approver can see/act on every team
-- they're assigned to lead, not just their own "home" team.

drop policy users_select on users;
create policy users_select on users for select to authenticated
  using (
    id = auth.uid()
    or auth_role() = 'admin'
    or (
      auth_role() = 'approver'
      and team_id in (select team_id from team_leads where user_id = auth.uid())
    )
  );

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

drop policy leave_requests_update_approver on leave_requests;
create policy leave_requests_update_approver on leave_requests for update to authenticated
  using (
    auth_role() = 'approver'
    and status = 'pending'
    and team_id in (select team_id from team_leads where user_id = auth.uid())
  )
  with check (
    auth_role() = 'approver'
    and team_id in (select team_id from team_leads where user_id = auth.uid())
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
