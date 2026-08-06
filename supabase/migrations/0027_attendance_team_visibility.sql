-- attendance_logs currently only lets the owner and admin read a row (see
-- 0022_attendance.sql). The new check-in/check-out report needs an approver
-- to see attendance for the teams they lead, same as they already can for
-- leave_requests. Added as an extra permissive policy (not a replacement) —
-- Postgres OR-combines permissive SELECT policies, so this only widens
-- visibility, it never narrows the existing owner/admin policy.
create policy attendance_logs_select_approver on attendance_logs for select to authenticated
  using (
    exists (
      select 1 from user_teams ut
       where ut.user_id = attendance_logs.user_id
         and ut.team_id in (select team_id from team_leads where user_id = auth.uid())
    )
  );
