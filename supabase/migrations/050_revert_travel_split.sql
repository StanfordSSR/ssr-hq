-- Undo migration 049: collapse gas / car_rental / accommodation / travel_fares
-- back into a single 'travel' category.

-- 1. Drop the expanded check constraints so the remapping is allowed.
alter table public.budget_expense_items drop constraint if exists budget_expense_items_category_check;
alter table public.budget_funding_sources drop constraint if exists budget_funding_sources_category_check;
alter table public.purchase_logs drop constraint if exists purchase_logs_category_check;

-- 2. Annual-grant sources: fold gas/car_rental/accommodation amounts into the
--    travel_fares grant, drop those three, then rename travel_fares -> travel.
update public.budget_funding_sources tf
set amount_cents = tf.amount_cents + coalesce((
  select sum(s.amount_cents) from public.budget_funding_sources s
  where s.plan_id = tf.plan_id and s.kind = 'annual_grant'
    and s.category in ('gas', 'car_rental', 'accommodation')
), 0)
where tf.kind = 'annual_grant' and tf.category = 'travel_fares';

delete from public.budget_funding_sources
where kind = 'annual_grant' and category in ('gas', 'car_rental', 'accommodation');

update public.budget_funding_sources
set category = 'travel'
where kind = 'annual_grant' and category = 'travel_fares';

-- 3. Other (non-grant) sources: travel sub-categories -> travel.
update public.budget_funding_sources
set category = 'travel'
where kind <> 'annual_grant' and category in ('gas', 'car_rental', 'accommodation', 'travel_fares');

-- 4. Team expense rows: collapse the travel sub-categories to one 'travel' row
--    per team (keep the largest; the unique index forbids duplicates).
with travel_team_rows as (
  select id,
    row_number() over (partition by plan_id, team_id order by amount_cents desc, id) as rn
  from public.budget_expense_items
  where kind = 'team' and category in ('gas', 'car_rental', 'accommodation', 'travel_fares')
)
delete from public.budget_expense_items where id in (select id from travel_team_rows where rn > 1);

update public.budget_expense_items
set category = 'travel'
where kind = 'team' and category in ('gas', 'car_rental', 'accommodation', 'travel_fares');

-- 5. Non-team expense rows (events, sub-items): travel sub-categories -> travel.
update public.budget_expense_items
set category = 'travel'
where kind <> 'team' and category in ('gas', 'car_rental', 'accommodation', 'travel_fares');

-- 6. Purchases: travel sub-categories -> travel.
update public.purchase_logs
set category = 'travel'
where category in ('gas', 'car_rental', 'accommodation', 'travel_fares');

-- 7. Restore the original check constraints.
alter table public.budget_expense_items add constraint budget_expense_items_category_check
  check (category in ('equipment', 'food', 'travel', 'other'));
alter table public.budget_funding_sources add constraint budget_funding_sources_category_check
  check (category in ('equipment', 'food', 'travel', 'other'));
alter table public.purchase_logs add constraint purchase_logs_category_check
  check (category in ('equipment', 'food', 'travel'));
