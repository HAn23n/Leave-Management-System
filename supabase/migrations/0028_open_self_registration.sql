-- Matches the app-level change in auth/callback/route.ts: pre-provisioning
-- (pending_user_roles / pending_team_leads) is no longer a login gate, only
-- a way to grant an approver/admin role or a team ahead of time. Drops the
-- "must already be pre-provisioned" clause added in 0019_pin_user_identity
-- while keeping every other guard from that migration: still capped at
-- role='user' + is_active=true (anti privilege-escalation), still pinned to
-- the caller's own id and their Google-issued JWT email (anti impersonation).
drop policy users_insert_self on users;
create policy users_insert_self on users for insert to authenticated
  with check (
    id = auth.uid()
    and role = 'user'
    and is_active = true
    and email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
