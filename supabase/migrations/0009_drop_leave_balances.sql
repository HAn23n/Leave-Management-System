-- ============================================================================
-- Drop leave_balances — it was scaffolded for a future leave-quota feature
-- but is unused by the app (never queried anywhere) and out of scope: leave
-- is unlimited, no quota to track. Cascade takes its RLS policies with it.
-- ============================================================================

drop table if exists leave_balances cascade;
