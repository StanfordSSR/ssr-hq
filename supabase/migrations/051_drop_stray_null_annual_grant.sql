-- Remove the legacy uncategorized (null-category) default-pool annual grant
-- left over from before per-category annual grants. Annual grants are now one
-- permanent row per category; the null one is a stray empty row.
delete from public.budget_funding_sources s
where s.kind = 'annual_grant' and s.category is null
  and not exists (select 1 from public.budget_allocations a where a.source_id = s.id);
