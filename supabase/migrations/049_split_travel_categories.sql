-- Split the single "travel" category into gas / car_rental / accommodation / travel_fares.
-- Categories now: equipment, food, gas, car_rental, accommodation, travel_fares, other.

-- 1. Migrate existing 'travel' rows to 'travel_fares' BEFORE tightening constraints.
update public.budget_expense_items set category = 'travel_fares' where category = 'travel';
update public.budget_funding_sources set category = 'travel_fares' where category = 'travel';
update public.purchase_logs set category = 'travel_fares' where category = 'travel';

-- 2. Replace the check constraints with the expanded category set.
alter table public.budget_expense_items drop constraint if exists budget_expense_items_category_check;
alter table public.budget_expense_items add constraint budget_expense_items_category_check
  check (category in ('equipment', 'food', 'gas', 'car_rental', 'accommodation', 'travel_fares', 'other'));

alter table public.budget_funding_sources drop constraint if exists budget_funding_sources_category_check;
alter table public.budget_funding_sources add constraint budget_funding_sources_category_check
  check (category in ('equipment', 'food', 'gas', 'car_rental', 'accommodation', 'travel_fares', 'other'));

alter table public.purchase_logs drop constraint if exists purchase_logs_category_check;
alter table public.purchase_logs add constraint purchase_logs_category_check
  check (category in ('equipment', 'food', 'gas', 'car_rental', 'accommodation', 'travel_fares', 'other'));

-- 3. Ensure every plan has all seven permanent annual-grant rows.
insert into public.budget_funding_sources (plan_id, label, kind, category, amount_cents, is_default_pool, sort_order)
select p.id, 'Annual grant', 'annual_grant', c.cat, 0, false, 0
from public.budget_plans p
cross join (
  values ('equipment'), ('food'), ('gas'), ('car_rental'), ('accommodation'), ('travel_fares'), ('other')
) as c(cat)
where not exists (
  select 1 from public.budget_funding_sources s
  where s.plan_id = p.id and s.kind = 'annual_grant' and s.category = c.cat
);
