-- Manually logged RoboSub purchases (reimbursements R-119704 and R-119707).
-- Resolves the RoboSub team by name; inserts nothing if no such team exists.
-- The multi-line electronics reimbursement (R-119707) is recorded as a single
-- line at its total ($1,130.99).
insert into public.purchase_logs
  (team_id, expense_type, created_by, academic_year, amount_cents, description, person_name, purchased_at, payment_method, category, receipt_not_needed)
select
  t.id,
  'team',
  null,
  '2025-26',
  v.amount_cents,
  v.description,
  v.person_name,
  v.purchased_at,
  'reimbursement',
  v.category,
  true
from (
  select id from public.teams where name ilike '%robosub%' order by name limit 1
) t
cross join (values
  (10689, 'RoboSub 2026 Airbnb replacement — difference (R-119704)', 'Ryota Sato', timestamptz '2026-05-18 12:00:00-07', 'travel'),
  (113099, 'RoboSub electronics: microcontrollers, cables, adapters, tools, battery, charger, barometer (R-119707)', 'Ryota Sato', timestamptz '2026-05-31 12:00:00-07', 'equipment')
) as v(amount_cents, description, person_name, purchased_at, category);
