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

-- At most one annual grant per category within a plan (null category counts as one).
create unique index if not exists uq_bfs_annual_grant_category
  on public.budget_funding_sources(plan_id, coalesce(category, ''))
  where kind = 'annual_grant';
