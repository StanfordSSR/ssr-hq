alter table public.purchase_logs
  add column if not exists receipt_not_needed boolean not null default false;
