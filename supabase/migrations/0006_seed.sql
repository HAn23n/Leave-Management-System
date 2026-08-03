-- ============================================================================
-- Seed data
-- ============================================================================

insert into teams (name) values ('ทีม A');

insert into leave_types (name, color) values
  ('ลาป่วย', '#dc2626'),
  ('ลากิจ', '#2563eb'),
  ('ลาพักร้อน', '#16a34a');

-- Thai public holidays for 2026 — fixed-date holidays only (these don't move year to year).
-- Buddhist lunar holidays (Makha Bucha / Visakha Bucha / Asalha Bucha / Buddhist
-- Lent) and any substitution days shift every year per the lunar calendar and
-- cabinet resolution — admin should add those via Settings once the official
-- date is confirmed (source = 'manual').
insert into holidays (holiday_date, name, source) values
  ('2026-01-01', 'วันขึ้นปีใหม่', 'seed'),
  ('2026-04-06', 'วันจักรี', 'seed'),
  ('2026-04-13', 'วันสงกรานต์', 'seed'),
  ('2026-04-14', 'วันสงกรานต์', 'seed'),
  ('2026-04-15', 'วันสงกรานต์', 'seed'),
  ('2026-05-01', 'วันแรงงานแห่งชาติ', 'seed'),
  ('2026-05-04', 'วันฉัตรมงคล', 'seed'),
  ('2026-07-28', 'วันเฉลิมพระชนมพรรษา ร.10', 'seed'),
  ('2026-08-12', 'วันแม่แห่งชาติ', 'seed'),
  ('2026-10-13', 'วันคล้ายวันสวรรคต ร.9', 'seed'),
  ('2026-10-23', 'วันปิยมหาราช', 'seed'),
  ('2026-12-05', 'วันพ่อแห่งชาติ / วันคล้ายวันเฉลิมพระชนมพรรษา ร.9', 'seed'),
  ('2026-12-10', 'วันรัฐธรรมนูญ', 'seed'),
  ('2026-12-31', 'วันสิ้นปี', 'seed');
