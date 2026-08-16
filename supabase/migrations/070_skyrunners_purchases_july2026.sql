-- Manually logged SkyRunners purchases for July 30, 2026.
-- Resolves the SkyRunners team by name; inserts nothing if no such team exists.
-- Payment method is 'amazon' for the Amazon Marketplace order and 'unknown' for
-- the other two (not specified at logging time — editable later); receipts are
-- marked not-needed so these don't enter the receipt-chase queue.
insert into public.purchase_logs
  (team_id, expense_type, created_by, academic_year, amount_cents, description, person_name, purchased_at, payment_method, category, receipt_not_needed)
select
  t.id,
  'team',
  null,
  '2025-26',
  v.amount_cents,
  v.description,
  null,
  v.purchased_at,
  v.payment_method,
  'equipment',
  true
from (
  select id from public.teams where name ilike '%skyrunners%' order by name limit 1
) t
cross join (values
  (17800, '14.4V 10000 mAh Li-Ion battery', timestamptz '2026-07-30 12:00:00-07', 'unknown'),
  (79600, 'Holybro order — flight avionics', timestamptz '2026-07-30 12:00:00-07', 'unknown'),
  (20000, 'Amazon MKTPL — carbon fibre parts, epoxy, mold release', timestamptz '2026-07-30 12:00:00-07', 'amazon')
) as v(amount_cents, description, purchased_at, payment_method);
