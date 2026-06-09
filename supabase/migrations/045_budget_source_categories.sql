-- Funding sources gain a category and richer kinds (annual grants come in
-- categorized line items, e.g. ASSU equipment grant vs food grant).

-- Drop the old constraint FIRST so the rename below is allowed.
alter table public.budget_funding_sources drop constraint if exists budget_funding_sources_kind_check;

update public.budget_funding_sources set kind = 'reserve_grant' where kind = 'grant_reserves';

alter table public.budget_funding_sources
  add constraint budget_funding_sources_kind_check
  check (kind in ('annual_grant', 'reserve_grant', 'grant', 'sponsorship', 'other'));

alter table public.budget_funding_sources
  add column if not exists category text check (category in ('equipment', 'food', 'travel', 'other'));

-- Resolve any pre-existing duplicate annual grants before enforcing uniqueness:
-- keep one per (plan, category) — preferring the default pool, then the oldest —
-- and demote the rest to the 'grant' kind.
with ranked as (
  select id,
         row_number() over (
           partition by plan_id, coalesce(category, '')
           order by is_default_pool desc, created_at asc
         ) as rn
  from public.budget_funding_sources
  where kind = 'annual_grant'
)
update public.budget_funding_sources s
set kind = 'grant'
from ranked
where s.id = ranked.id and ranked.rn > 1;

-- At most one annual grant per category within a plan (null category counts as one).
create unique index if not exists uq_bfs_annual_grant_category
  on public.budget_funding_sources(plan_id, coalesce(category, ''))
  where kind = 'annual_grant';
