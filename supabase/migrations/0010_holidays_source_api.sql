-- ============================================================================
-- Allow 'api' as a holidays.source value, for rows written by the yearly
-- public-holiday sync (see /api/cron/sync-holidays) — distinct from 'seed'
-- (hardcoded in migration 0006) and 'manual' (typed by an admin in Settings).
-- ============================================================================

alter table holidays drop constraint holidays_source_check;
alter table holidays add constraint holidays_source_check check (source in ('seed', 'manual', 'api'));
