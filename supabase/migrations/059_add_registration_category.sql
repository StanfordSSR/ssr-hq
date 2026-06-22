-- Add a "registration" category to purchase logs and budget plan tables.
alter table public.purchase_logs drop constraint if exists purchase_logs_category_check;
alter table public.purchase_logs add constraint purchase_logs_category_check
  check (category in ('equipment', 'food', 'travel', 'registration'));

alter table public.budget_expense_items drop constraint if exists budget_expense_items_category_check;
alter table public.budget_expense_items add constraint budget_expense_items_category_check
  check (category in ('equipment', 'food', 'travel', 'other', 'registration'));

alter table public.budget_funding_sources drop constraint if exists budget_funding_sources_category_check;
alter table public.budget_funding_sources add constraint budget_funding_sources_category_check
  check (category in ('equipment', 'food', 'travel', 'other', 'registration'));
