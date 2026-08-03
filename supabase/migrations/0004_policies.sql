-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table teams enable row level security;
alter table users enable row level security;
alter table team_leads enable row level security;
alter table user_team_logs enable row level security;
alter table approver_mappings enable row level security;
alter table leave_types enable row level security;
alter table holidays enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table leave_request_logs enable row level security;
alter table doc_counters enable row level security;   -- no policy = totally inaccessible to clients; only the SECURITY DEFINER function touches it

-- teams: readable by anyone logged in (needed to pick a team during onboarding), writable by admin only
create policy teams_select on teams for select to authenticated using (true);
create policy teams_write_admin on teams for insert to authenticated with check (auth_role() = 'admin');
create policy teams_update_admin on teams for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- users: sees self / approver sees own team / admin sees everyone
create policy users_select on users for select to authenticated
  using (id = auth.uid() or auth_role() = 'admin' or (auth_role() = 'approver' and team_id = auth_team_id()));

-- Blocks privilege escalation: the self-insert (row created on first login)
-- must have role='user' and is_active=true — a client can never sign itself
-- up as admin/approver
create policy users_insert_self on users for insert to authenticated
  with check (id = auth.uid() and role = 'user' and is_active = true);

-- update: the owner can edit their own row (role/is_active are blocked by the
-- trigger above), or an admin can edit anyone's
create policy users_update_self on users for update to authenticated
  using (id = auth.uid() or auth_role() = 'admin')
  with check (id = auth.uid() or auth_role() = 'admin');

-- team_leads: readable by everyone (used to derive the approval chain), writable by admin only
create policy team_leads_select on team_leads for select to authenticated using (true);
create policy team_leads_insert_admin on team_leads for insert to authenticated with check (auth_role() = 'admin');
create policy team_leads_update_admin on team_leads for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy team_leads_delete_admin on team_leads for delete to authenticated using (auth_role() = 'admin');

-- user_team_logs: owner reads their own log, admin reads all, inserts only happen via the trigger
create policy user_team_logs_select on user_team_logs for select to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');

-- approver_mappings: admin manages them, the involved requester/approver can read
create policy approver_mappings_select on approver_mappings for select to authenticated
  using (user_id = auth.uid() or approver_id = auth.uid() or auth_role() = 'admin');
create policy approver_mappings_write_admin on approver_mappings for insert to authenticated with check (auth_role() = 'admin');
create policy approver_mappings_update_admin on approver_mappings for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy approver_mappings_delete_admin on approver_mappings for delete to authenticated using (auth_role() = 'admin');

-- leave_types: readable by everyone, writable by admin only (soft delete via is_active)
create policy leave_types_select on leave_types for select to authenticated using (true);
create policy leave_types_insert_admin on leave_types for insert to authenticated with check (auth_role() = 'admin');
create policy leave_types_update_admin on leave_types for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- holidays: readable by everyone, writable by admin only
create policy holidays_select on holidays for select to authenticated using (true);
create policy holidays_insert_admin on holidays for insert to authenticated with check (auth_role() = 'admin');
create policy holidays_update_admin on holidays for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy holidays_delete_admin on holidays for delete to authenticated using (auth_role() = 'admin');

-- leave_balances: owner reads their own, approver reads their team, admin manages everything (not enforced in the app yet)
create policy leave_balances_select on leave_balances for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (auth_role() = 'approver' and user_id in (select id from users where team_id = auth_team_id()))
  );
create policy leave_balances_write_admin on leave_balances for insert to authenticated with check (auth_role() = 'admin');
create policy leave_balances_update_admin on leave_balances for update to authenticated using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- leave_requests: the core of the system — scoped by role at the DB level
create policy leave_requests_select on leave_requests for select to authenticated
  using (
    user_id = auth.uid()
    or auth_role() = 'admin'
    or (auth_role() = 'approver' and team_id = auth_team_id())
  );

-- New inserts must always be 'draft' (even when an approver files their own
-- leave, it's still created as draft first, then updated to approved via the
-- leave_requests_update_approver policy in the next step)
create policy leave_requests_insert_own on leave_requests for insert to authenticated
  with check (user_id = auth.uid() and team_id = auth_team_id() and status = 'draft');

-- The owner may only edit while draft/returned/pending (editing before
-- approval, submitting, or cancelling). WITH CHECK restricts the resulting
-- status to draft/pending/cancelled only — a plain user can never set their
-- own request to approved/rejected/returned (only the approver/admin
-- policies below allow that)
create policy leave_requests_update_own on leave_requests for update to authenticated
  using (user_id = auth.uid() and status in ('draft', 'returned', 'pending'))
  with check (user_id = auth.uid() and status in ('draft', 'pending', 'cancelled'));

-- An approver can act (approve/reject/return) on requests within their own team
create policy leave_requests_update_approver on leave_requests for update to authenticated
  using (auth_role() = 'approver' and team_id = auth_team_id())
  with check (auth_role() = 'approver' and team_id = auth_team_id());

create policy leave_requests_update_admin on leave_requests for update to authenticated
  using (auth_role() = 'admin')
  with check (auth_role() = 'admin');

-- leave_request_logs: readable with the same scope as the leave_requests row it references, writable only by the trigger (SECURITY DEFINER)
create policy leave_request_logs_select on leave_request_logs for select to authenticated
  using (
    exists (
      select 1 from leave_requests lr
       where lr.id = leave_request_logs.request_id
         and (
           lr.user_id = auth.uid()
           or auth_role() = 'admin'
           or (auth_role() = 'approver' and lr.team_id = auth_team_id())
         )
    )
  );
