-- Manually logged RoboSub purchases (year-end backfill requested by leadership).
-- Resolves the RoboSub team by name; inserts nothing if no such team exists.
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
  'unknown',
  v.category,
  true
from (
  select id from public.teams where name ilike '%robosub%' order by name limit 1
) t
cross join (values
  (333380, 'Airbnb for competition', 'Ryota', timestamptz '2026-06-07 12:00:00-07', 'travel'),
  (33361, 'Motors', 'Kai Song', timestamptz '2026-05-05 12:00:00-07', 'equipment'),
  (19811, 'Electrical misc', 'Ryota', timestamptz '2026-05-06 12:00:00-07', 'equipment'),
  (5486, 'Servos for RoboSub', 'Felicie', timestamptz '2026-05-05 12:00:00-07', 'equipment'),
  (6304, 'Servos for RoboSub (additional)', 'Felicie', timestamptz '2026-05-05 12:00:00-07', 'equipment')
) as v(amount_cents, description, person_name, purchased_at, category);
