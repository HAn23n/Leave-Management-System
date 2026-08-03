-- ============================================================================
-- Found during code review:
--
-- 1. leave_requests_update_own's WITH CHECK only pinned user_id/status, so a
--    client bypassing the app (direct Supabase call, anon key + session is
--    enough) could set approver_id to an arbitrary user's UUID on their own
--    request. That chains into 0007_approver_visibility's policy, which
--    grants SELECT on `users` for whoever a request's approver_id points to
--    — letting a plain user read a stranger's email/role/etc. It also left
--    team_id, request_no, total_days, submitted_at, and approved_at
--    unprotected against direct writes. Fixed with a guard trigger (mirrors
--    the existing guard_users_privileged_fields() pattern) rather than RLS,
--    since RLS's WITH CHECK can't cleanly compare against the pre-update row.
--
-- 2. leave_requests_update_approver had no status restriction in RLS — only
--    app code (decideOnPendingRequest) enforced "pending only". Tightened to
--    match the actual intent.
--
-- 3. The approver_mappings override (cross-team special-case approver) was
--    unusable in practice: leave_requests_select/update_approver both key off
--    team_id = auth_team_id(), so an override approver in a different team
--    could never see or act on the request they were assigned. Added
--    dedicated policies keyed off approver_mappings instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Field-ownership guard
-- ----------------------------------------------------------------------------

create or replace function guard_leave_request_field_ownership() returns trigger
language plpgsql as $$
begin
  if auth_role() = 'admin' then
    return new;
  end if;

  -- Only the request lifecycle triggers (or an admin) may move these —
  -- never a direct client write.
  if new.team_id is distinct from old.team_id
     or new.request_no is distinct from old.request_no
     or new.total_days is distinct from old.total_days
     or new.submitted_at is distinct from old.submitted_at
     or new.approved_at is distinct from old.approved_at then
    raise exception 'ไม่สามารถแก้ไขข้อมูลส่วนนี้ได้โดยตรง';
  end if;

  -- approver_id may be cleared (null, e.g. on resubmit) or set to the
  -- caller's own id (approve/reject/return/approve-own all do this), but
  -- never pointed at someone else.
  if new.approver_id is distinct from old.approver_id
     and new.approver_id is not null
     and new.approver_id is distinct from auth.uid() then
    raise exception 'ไม่สามารถกำหนดผู้อนุมัติเป็นผู้อื่นได้';
  end if;

  -- The requester may clear their own approver_note (resubmitting after a
  -- return wipes the old note — see the submit route) but never set it to
  -- forge an approval/rejection note on their own request. An approver
  -- setting a note on someone else's request is unaffected by this check
  -- since it only applies when new.user_id = auth.uid().
  if new.approver_note is distinct from old.approver_note
     and new.user_id = auth.uid()
     and new.approver_note is not null then
    raise exception 'ไม่สามารถแก้ไขหมายเหตุของผู้อนุมัติได้';
  end if;

  return new;
end;
$$;

-- Named with a leading underscore so it sorts before trg_a_/trg_b_/trg_c_ in
-- 0003_triggers.sql — it must run before freeze_total_days sets
-- total_days/submitted_at/approved_at, otherwise this guard would see (and
-- reject) that trigger's own legitimate changes.
create trigger trg__leave_requests_guard_fields
  before update on leave_requests
  for each row execute function guard_leave_request_field_ownership();

-- ----------------------------------------------------------------------------
-- 2. Tighten the approver policy to pending-only, matching actual intent
-- ----------------------------------------------------------------------------

drop policy leave_requests_update_approver on leave_requests;

create policy leave_requests_update_approver on leave_requests for update to authenticated
  using (auth_role() = 'approver' and team_id = auth_team_id() and status = 'pending')
  with check (auth_role() = 'approver' and team_id = auth_team_id());

-- ----------------------------------------------------------------------------
-- 3. Make the approver_mappings override actually reachable cross-team
-- ----------------------------------------------------------------------------

create policy leave_requests_select_mapped_approver on leave_requests for select to authenticated
  using (
    exists (
      select 1 from approver_mappings am
       where am.user_id = leave_requests.user_id and am.approver_id = auth.uid()
    )
  );

create policy leave_requests_update_mapped_approver on leave_requests for update to authenticated
  using (
    status = 'pending'
    and exists (
      select 1 from approver_mappings am
       where am.user_id = leave_requests.user_id and am.approver_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from approver_mappings am
       where am.user_id = leave_requests.user_id and am.approver_id = auth.uid()
    )
  );

-- leave_request_logs visibility needs the same extension so a mapped
-- cross-team approver can see the timeline of a request they can act on.
drop policy leave_request_logs_select on leave_request_logs;

create policy leave_request_logs_select on leave_request_logs for select to authenticated
  using (
    exists (
      select 1 from leave_requests lr
       where lr.id = leave_request_logs.request_id
         and (
           lr.user_id = auth.uid()
           or auth_role() = 'admin'
           or (auth_role() = 'approver' and lr.team_id = auth_team_id())
           or exists (
             select 1 from approver_mappings am
              where am.user_id = lr.user_id and am.approver_id = auth.uid()
           )
         )
    )
  );
