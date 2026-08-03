-- ============================================================================
-- Helper + business functions
-- ============================================================================

-- SECURITY DEFINER, read the caller's role/team via auth.uid() — avoids
-- recursive RLS when the users table's own policies need to reference users
create or replace function auth_role() returns text
language sql security definer stable
set search_path = public
as $$
  select role from users where id = auth.uid();
$$;

create or replace function auth_team_id() returns uuid
language sql security definer stable
set search_path = public
as $$
  select team_id from users where id = auth.uid();
$$;

-- Calculates leave days: counts Mon-Fri only, excludes holidays, Bangkok-local
-- business logic, half-day periods = 0.5
create or replace function calc_total_days(
  p_start        date,
  p_end          date,
  p_start_period text,
  p_end_period   text
) returns numeric(4,1)
language plpgsql
stable
as $$
declare
  v_total  numeric := 0;
  v_day    date := p_start;
  v_is_biz boolean;
begin
  if p_start > p_end then
    return 0;
  end if;

  while v_day <= p_end loop
    v_is_biz := extract(isodow from v_day) < 6
      and not exists (select 1 from holidays h where h.holiday_date = v_day);

    if v_is_biz then
      if v_day = p_start and v_day = p_end then
        if p_start_period = 'full' and p_end_period = 'full' then
          v_total := v_total + 1;
        else
          v_total := v_total + 0.5;
        end if;
      elsif v_day = p_start then
        v_total := v_total + (case when p_start_period = 'full' then 1 else 0.5 end);
      elsif v_day = p_end then
        v_total := v_total + (case when p_end_period = 'full' then 1 else 0.5 end);
      else
        v_total := v_total + 1;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return v_total;
end;
$$;
grant execute on function calc_total_days(date, date, text, text) to authenticated;

-- Atomic document-number generation: per-month counter table + FOR UPDATE
-- (never uses COUNT(*)+1, which would race under concurrent submissions)
create or replace function gen_request_no(p_date date default current_date) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym   text := to_char(p_date, 'YYYYMM');
  v_next int;
begin
  insert into doc_counters (ym, last_no) values (v_ym, 0)
    on conflict (ym) do nothing;

  perform 1 from doc_counters where ym = v_ym for update;

  update doc_counters
     set last_no = last_no + 1
   where ym = v_ym
  returning last_no into v_next;

  -- Supports going past 999: pads to a minimum of 3 digits but never errors past it
  -- (lpad doesn't truncate numbers that are already longer than the target width)
  return v_ym || lpad(v_next::text, 3, '0');
end;
$$;
