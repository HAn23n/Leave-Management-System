-- Stop collecting/storing display names; email is the identifier everywhere
-- (onboarding no longer asks for a name, reports/lists/emails show email).
alter table users drop column full_name;
