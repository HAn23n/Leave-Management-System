-- ============================================================================
-- Grants (RLS restricts *which rows* are visible, but table/column-level
-- privileges still need to be granted separately)
-- ============================================================================

grant usage on schema public to authenticated;
grant select, insert, update on
  teams, users, team_leads, user_team_logs, approver_mappings,
  leave_types, holidays, leave_balances, leave_requests, leave_request_logs
  to authenticated;
-- doc_counters: intentionally not granted to authenticated at all — only reachable via the SECURITY DEFINER function
