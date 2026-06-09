-- Annual grants are now permanent, per-category rows (equipment/food/travel/other).
-- Backfill four annual-grant sources per plan.

-- 1. Repurpose any uncategorized annual grant into 'equipment' (when none exists yet).
update public.budget_funding_sources s
set category = 'equipment'
where s.kind = 'annual_grant' and s.category is null
  and not exists (
    select 1 from public.budget_funding_sources s2
    where s2.plan_id = s.plan_id and s2.kind = 'annual_grant' and s2.category = 'equipment'
  );

-- 2. Drop any leftover uncategorized annual grants (no allocations reference them).
delete from public.budget_funding_sources s
where s.kind = 'annual_grant' and s.category is null
  and not exists (select 1 from public.budget_allocations a where a.source_id = s.id);

-- 3. Insert any missing category annual grants per plan.
insert into public.budget_funding_sources (plan_id, label, kind, category, amount_cents, is_default_pool, sort_order)
select p.id, 'Annual grant', 'annual_grant', c.cat, 0, false, 0
from public.budget_plans p
cross join (values ('equipment'), ('food'), ('travel'), ('other')) as c(cat)
where not exists (
  select 1 from public.budget_funding_sources s
  where s.plan_id = p.id and s.kind = 'annual_grant' and s.category = c.cat
);
