-- Monthly performance evaluation: a team lead scores each of their team
-- members once per period ('YYYY-MM') across 5 fixed criteria (1-5 each),
-- weighted 20% apiece — punctuality, responsibility, achievement, task
-- delivery, job skills. total_percentage/passed are generated columns so
-- they're always consistent with the raw scores and usable directly in
-- filters/reports without recomputing app-side.
--
-- Visibility is deliberately one-directional: the evaluator (and admin) can
-- read a row, the evaluated employee never can — there's no
-- `user_id = auth.uid()` clause anywhere below.
create table performance_evaluations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete restrict,
  team_id               uuid not null references teams(id) on delete restrict,
  evaluator_id          uuid not null references users(id) on delete restrict,
  period                text not null,  -- 'YYYY-MM'
  score_punctuality     smallint not null check (score_punctuality between 1 and 5),
  score_responsibility  smallint not null check (score_responsibility between 1 and 5),
  score_achievement     smallint not null check (score_achievement between 1 and 5),
  score_delivery        smallint not null check (score_delivery between 1 and 5),
  score_skill           smallint not null check (score_skill between 1 and 5),
  total_percentage      numeric(5,2) generated always as (
    round((score_punctuality + score_responsibility + score_achievement
           + score_delivery + score_skill)::numeric / 5 * 20, 2)
  ) stored,
  passed                boolean generated always as (
    (score_punctuality + score_responsibility + score_achievement
     + score_delivery + score_skill)::numeric / 5 * 20 >= 50
  ) stored,
  note                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, period)
);
create index idx_performance_evaluations_team_period on performance_evaluations(team_id, period);

alter table performance_evaluations enable row level security;

create trigger trg_performance_evaluations_updated_at
  before update on performance_evaluations
  for each row execute function set_updated_at();

create policy performance_evaluations_select on performance_evaluations for select to authenticated
  using (
    auth_role() = 'admin'
    or evaluator_id = auth.uid()
  );

create policy performance_evaluations_insert on performance_evaluations for insert to authenticated
  with check (
    auth_role() = 'admin'
    or (
      evaluator_id = auth.uid()
      and exists (
        select 1 from user_teams ut
         where ut.user_id = performance_evaluations.user_id
           and ut.team_id = performance_evaluations.team_id
           and ut.team_id in (select team_id from team_leads where user_id = auth.uid())
      )
    )
  );

create policy performance_evaluations_update on performance_evaluations for update to authenticated
  using (auth_role() = 'admin' or evaluator_id = auth.uid())
  with check (auth_role() = 'admin' or evaluator_id = auth.uid());
