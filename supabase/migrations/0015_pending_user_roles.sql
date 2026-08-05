-- Lets an admin pre-provision a not-yet-logged-in person's role/team/approval
-- order by email, before they've ever signed in. Consumed by the first-login
-- flow (src/app/auth/callback/route.ts) once that email actually signs in
-- via Google — via the service-role client, since the normal self-insert
-- policy (users_insert_self) can never grant more than role='user' to a
-- client-driven insert, by design (anti privilege-escalation).
create table pending_user_roles (
  email          text primary key,
  role           text not null default 'user' check (role in ('admin', 'approver', 'user')),
  team_id        uuid references teams(id) on delete set null,
  approval_order int, -- only meaningful when role = 'approver'; null = append to the end of the chain
  created_at     timestamptz not null default now()
);

alter table pending_user_roles enable row level security;

create policy pending_user_roles_select_admin on pending_user_roles for select to authenticated
  using (auth_role() = 'admin');
create policy pending_user_roles_insert_admin on pending_user_roles for insert to authenticated
  with check (auth_role() = 'admin');
create policy pending_user_roles_update_admin on pending_user_roles for update to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');
create policy pending_user_roles_delete_admin on pending_user_roles for delete to authenticated
  using (auth_role() = 'admin');

grant select, insert, update on pending_user_roles to authenticated;
