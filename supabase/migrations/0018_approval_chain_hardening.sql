-- Code-review fixes for the sequential approval chain (0014/0016):
--
-- 1. leave_requests.current_level now identifies an approver by the STABLE
--    team_leads.approval_order value (not by array position, which shifts
--    whenever a lead is added/removed/reordered and would silently retarget
--    an in-flight request to a different person). Application code
--    (src/lib/approval-chain.ts, src/lib/leave-requests.ts) is updated to
--    match in the same change.
--
-- 2. leave_requests_update_approver RLS now actually enforces "only the
--    approver assigned to the row's current level may write to it" — it
--    previously only checked team membership, so any approver on the team
--    could finalize/skip a pending request via a direct Supabase call,
--    bypassing app-level level checks entirely (the same class of gap
--    0008_leave_request_field_guard_and_mapped_approver.sql was written to
--    close for status). Now that current_level IS the stable approval_order
--    value (see #1), this check is a direct equality, no window function
--    needed.
drop policy leave_requests_update_approver on leave_requests;
create policy leave_requests_update_approver on leave_requests for update to authenticated
  using (
    auth_role() = 'approver'
    and status = 'pending'
    and exists (
      select 1 from team_leads tl
       where tl.team_id = leave_requests.team_id
         and tl.user_id = auth.uid()
         and tl.approval_order = leave_requests.current_level
    )
  )
  with check (
    auth_role() = 'approver'
    and team_id in (select team_id from team_leads where user_id = auth.uid())
  );

-- 3. Atomic reorder: moveTeamLead previously did a 3-step swap (via a -1
-- sentinel to dodge the unique (team_id, approval_order) constraint) as 3
-- separate, unchecked round trips from application code — an interruption
-- between steps left a lead permanently stuck at approval_order = -1,
-- silently jumping the queue. Wrapping it in one function makes it a single
-- atomic transaction.
create or replace function move_team_lead(p_id uuid, p_direction text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_order int;
  v_neighbor_id uuid;
  v_neighbor_order int;
begin
  if auth_role() <> 'admin' then
    raise exception 'เฉพาะ admin เท่านั้นที่จัดลำดับผู้อนุมัติได้';
  end if;

  select team_id, approval_order into v_team_id, v_order from team_leads where id = p_id;
  if v_team_id is null then
    return;
  end if;

  if p_direction = 'up' then
    select id, approval_order into v_neighbor_id, v_neighbor_order
      from team_leads
     where team_id = v_team_id and approval_order < v_order
     order by approval_order desc
     limit 1;
  else
    select id, approval_order into v_neighbor_id, v_neighbor_order
      from team_leads
     where team_id = v_team_id and approval_order > v_order
     order by approval_order asc
     limit 1;
  end if;

  if v_neighbor_id is null then
    return;
  end if;

  update team_leads set approval_order = -1 where id = p_id;
  update team_leads set approval_order = v_order where id = v_neighbor_id;
  update team_leads set approval_order = v_neighbor_order where id = p_id;
end;
$$;

grant execute on function move_team_lead(uuid, text) to authenticated;

-- 4. Single source of truth for "approver role follows team_leads
-- membership" — this promote/demote rule was independently reimplemented in
-- 4 different app-code call sites (assignTeamLeadByEmail, removeTeamLead,
-- syncApprovedTeams, the auth callback's pending-invite consumption), with
-- already-visible drift between them (some only promote, some only demote).
-- A trigger makes it impossible for any future team_leads mutation path to
-- forget to re-derive the role correctly.
create or replace function sync_approver_role() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_role text;
  v_count int;
begin
  select role into v_role from users where id = v_user_id;
  if v_role is null or v_role = 'admin' then
    return coalesce(new, old);
  end if;

  select count(*) into v_count from team_leads where user_id = v_user_id;

  if v_count > 0 and v_role <> 'approver' then
    update users set role = 'approver' where id = v_user_id;
  elsif v_count = 0 and v_role = 'approver' then
    update users set role = 'user' where id = v_user_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_team_leads_sync_role
  after insert or delete on team_leads
  for each row execute function sync_approver_role();
