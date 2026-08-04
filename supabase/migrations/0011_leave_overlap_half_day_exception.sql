-- ============================================================================
-- check_leave_overlap() blocked ANY date-range overlap, even two single-day
-- half-day requests on the same date that don't actually conflict in time
-- (e.g. an approved morning leave + a new afternoon leave, same day). Add
-- that one exception; every other overlap (multi-day, full-day, same period
-- twice) is still blocked exactly as before.
-- ============================================================================

create or replace function check_leave_overlap() returns trigger
language plpgsql as $$
begin
  if new.status in ('pending', 'approved') then
    if exists (
      select 1 from leave_requests lr
       where lr.user_id = new.user_id
         and lr.id is distinct from new.id
         and lr.status in ('pending', 'approved')
         and lr.start_date <= new.end_date
         and lr.end_date >= new.start_date
         and not (
           lr.start_date = lr.end_date
           and new.start_date = new.end_date
           and lr.start_date = new.start_date
           and lr.start_period <> 'full'
           and new.start_period <> 'full'
           and lr.start_period <> new.start_period
         )
    ) then
      raise exception 'มีคำขอลาที่ทับซ้อนกับช่วงวันที่นี้อยู่แล้ว';
    end if;
  end if;
  return new;
end;
$$;
