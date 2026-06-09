-- One budget line per (team, category) within a plan — no duplicate
-- equipment/food/travel rows for the same team.

-- Remove existing duplicates first (keep the oldest per team+category).
with ranked as (
  select id,
         row_number() over (
           partition by plan_id, team_id, category
           order by created_at asc
         ) as rn
  from public.budget_expense_items
  where kind = 'team' and team_id is not null and category is not null
)
delete from public.budget_expense_items where id in (select id from ranked where rn > 1);

create unique index if not exists uq_bei_team_category
  on public.budget_expense_items(plan_id, team_id, category)
  where kind = 'team' and category is not null;
