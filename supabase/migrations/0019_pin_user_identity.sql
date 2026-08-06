-- Closes two identity-spoofing gaps found during a security review:
--
-- 1. users_insert_self's WITH CHECK never tied the row's `email` column to
--    the caller's actual authenticated identity — only id/role/is_active
--    were checked. Any authenticated user could self-insert their profile
--    with an arbitrary `email` (e.g. someone else's address), and since the
--    "remove full_name, use email everywhere" refactor made email the sole
--    identity shown in approvals/notifications/reports, that's a real
--    impersonation risk, not just cosmetic. Now pinned to the Google-issued
--    JWT's own email claim.
--
-- 2. The app's first-login flow (auth/callback/route.ts) now requires an
--    admin to have pre-provisioned the email in pending_user_roles or
--    pending_team_leads before granting access — but that gate lived only
--    in application code. The anon key + a valid Google session JWT is
--    enough to call the Supabase REST API directly and hit this same
--    policy, bypassing the app entirely. The provisioning check is now
--    enforced here too, so the rule holds even against a client that skips
--    the app.
--
-- Also adds a uniqueness constraint on email — nothing previously stopped
-- two rows from claiming the same address, which matters now that email
-- (not full_name) is the identifier approvals/notifications key off of.
-- Run this only after confirming no two active users currently share an
-- email (a fresh/reset dataset, as this project's prod data currently is,
-- won't hit this).
alter table users add constraint users_email_unique unique (email);

drop policy users_insert_self on users;
create policy users_insert_self on users for insert to authenticated
  with check (
    id = auth.uid()
    and role = 'user'
    and is_active = true
    and email = lower(coalesce(auth.jwt() ->> 'email', ''))
    and (
      exists (select 1 from pending_user_roles where email = users.email)
      or exists (select 1 from pending_team_leads where email = users.email)
    )
  );

create or replace function guard_users_privileged_fields() returns trigger
language plpgsql as $$
begin
  if (
    new.role is distinct from old.role
    or new.is_active is distinct from old.is_active
    or new.email is distinct from old.email
  )
  and auth_role() is distinct from 'admin' then
    raise exception 'เฉพาะ admin เท่านั้นที่เปลี่ยน role, is_active หรือ email ได้';
  end if;
  return new;
end;
$$;
