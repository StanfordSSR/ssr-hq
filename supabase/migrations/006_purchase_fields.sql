alter table public.purchase_logs
  add column if not exists purchased_at timestamptz not null default now(),
  add column if not exists person_name text,
  add column if not exists payment_method text not null default 'unknown' check (payment_method in ('reimbursement', 'credit_card', 'unknown')),
  add column if not exists category text not null default 'equipment' check (category in ('equipment', 'food', 'travel'));

update public.purchase_logs
set purchased_at = created_at
where purchased_at is null;
