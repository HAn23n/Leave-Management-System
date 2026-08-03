-- ============================================================================
-- Fixes a visibility gap found while building the reports/detail screens:
-- a plain 'user' could not read the full_name of the approver assigned to
-- their own leave request (users_select only allowed self / admin / same-team
-- approver), leaving "ผู้อนุมัติ" blank on the detail page and Excel export.
-- ============================================================================

create policy users_select_own_approver on users for select to authenticated
  using (
    exists (
      select 1 from leave_requests lr
       where lr.user_id = auth.uid() and lr.approver_id = users.id
    )
  );
