-- Keep each new reimbursement and ledger entry tied to the exact plan line and
-- funding source selected at submission. Nullable references preserve history
-- if a draft plan is later replaced; labels remain as an immutable snapshot.
alter table public.member_reimbursements alter column team_id drop not null;
alter table public.member_reimbursements
  add column if not exists expense_type text not null default 'team',
  add column if not exists budget_category text,
  add column if not exists budget_plan_id uuid references public.budget_plans(id) on delete set null,
  add column if not exists budget_expense_item_id uuid references public.budget_expense_items(id) on delete set null,
  add column if not exists budget_expense_label text,
  add column if not exists funding_source_id uuid references public.budget_funding_sources(id) on delete set null,
  add column if not exists funding_source_label text;
alter table public.member_reimbursements drop constraint if exists member_reimbursements_expense_scope_check;
alter table public.member_reimbursements
  add constraint member_reimbursements_expense_scope_check
  check ((expense_type = 'team' and team_id is not null) or (expense_type = 'leadership' and team_id is null));
alter table public.member_reimbursements drop constraint if exists member_reimbursements_budget_category_check;
alter table public.member_reimbursements
  add constraint member_reimbursements_budget_category_check
  check (budget_category is null or budget_category in ('equipment', 'food', 'travel', 'registration', 'other'));

alter table public.purchase_logs drop constraint if exists purchase_logs_category_check;
alter table public.purchase_logs add constraint purchase_logs_category_check
  check (category in ('equipment', 'food', 'travel', 'registration', 'other'));
alter table public.purchase_logs
  add column if not exists budget_plan_id uuid references public.budget_plans(id) on delete set null,
  add column if not exists budget_expense_item_id uuid references public.budget_expense_items(id) on delete set null,
  add column if not exists budget_expense_label text,
  add column if not exists funding_source_id uuid references public.budget_funding_sources(id) on delete set null,
  add column if not exists funding_source_label text;
create index if not exists idx_purchase_logs_funding_source on public.purchase_logs(funding_source_id)
  where funding_source_id is not null;
