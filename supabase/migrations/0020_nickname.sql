-- Nickname is purely cosmetic (unlike email, nothing keys approvals or
-- identity off it), so no extra RLS/trigger guard is needed — the existing
-- users_update_self policy (id = auth.uid()) already covers self-editing it.
alter table users add column nickname text;
