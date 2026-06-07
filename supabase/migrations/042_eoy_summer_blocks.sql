-- Teams barred from summer spending in the year-end report (e.g. unreconciled
-- expenses or delayed receipts). When flagged, the report shows a red warning
-- and the team cannot opt into summer spending.
create table if not exists public.eoy_summer_blocks (
  team_id uuid primary key references public.teams(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now()
);

-- Flag Conservation Technology and Skyrunners (default warning message used).
insert into public.eoy_summer_blocks (team_id)
select id from public.teams
where name ilike '%conservation%' or name ilike '%skyrunner%'
on conflict (team_id) do nothing;
