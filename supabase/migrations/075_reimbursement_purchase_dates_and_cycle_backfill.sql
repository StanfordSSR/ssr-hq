-- New reimbursements record when the purchase happened, independently of when
-- the member submitted it. Older rows keep NULL and retain their legacy date.
alter table public.member_reimbursements
  add column if not exists purchase_date date;

create index if not exists idx_member_reimbursements_year_status_team
  on public.member_reimbursements(academic_year, status, team_id);

-- September 2026 submissions made before the HQ rollover belong to 2026-27.
-- Preserve every historical row; change only the accounting cycle on records
-- whose purchase timestamp is in the new cycle.
update public.purchase_logs
set academic_year = '2026-27'
where academic_year = '2025-26'
  and purchased_at >= timestamptz '2026-09-01 00:00:00-07'
  and purchased_at < timestamptz '2027-09-01 00:00:00-07';

-- The existing September RoboSub travel reimbursements have a single possible
-- account and annual-grant source in the approved plan. Route those rows to it.
with travel_route as (
  select p.id as plan_id, e.id as expense_id, e.team_id, e.label as expense_label,
         s.id as source_id, s.label as source_label
  from public.budget_plans p
  join public.budget_expense_items e on e.plan_id = p.id
  join public.budget_funding_sources s on s.plan_id = p.id
  where p.academic_year = '2026-27' and p.status = 'approved'
    and e.kind = 'team' and e.category = 'travel' and e.parent_id is null
    and s.kind = 'annual_grant' and s.category = 'travel'
    and not exists (select 1 from public.budget_allocations a where a.expense_id = e.id and a.amount_cents > 0)
)
update public.purchase_logs l
set budget_plan_id = route.plan_id,
    budget_expense_item_id = route.expense_id,
    budget_expense_label = route.expense_label,
    funding_source_id = route.source_id,
    funding_source_label = route.source_label
from travel_route route
where l.team_id = route.team_id and l.category = 'travel'
  and l.academic_year = '2026-27'
  and l.purchased_at >= timestamptz '2026-09-01 00:00:00-07'
  and l.purchased_at < timestamptz '2026-10-01 00:00:00-07'
  and l.budget_expense_item_id is null;

update public.member_reimbursements r
set academic_year = l.academic_year,
    purchase_date = (l.purchased_at at time zone 'America/Los_Angeles')::date,
    budget_category = l.category,
    budget_plan_id = l.budget_plan_id,
    budget_expense_item_id = l.budget_expense_item_id,
    budget_expense_label = l.budget_expense_label,
    funding_source_id = l.funding_source_id,
    funding_source_label = l.funding_source_label
from public.purchase_logs l
where r.locked_purchase_log_id = l.id
  and r.academic_year = '2025-26'
  and l.academic_year = '2026-27'
  and l.purchased_at >= timestamptz '2026-09-01 00:00:00-07';
