-- Event/operations line items can be split into per-category sub-items.
-- A sub-item points at its parent expense row via parent_id.
alter table public.budget_expense_items
  add column if not exists parent_id uuid references public.budget_expense_items(id) on delete cascade;

create index if not exists idx_bei_parent on public.budget_expense_items(parent_id);
