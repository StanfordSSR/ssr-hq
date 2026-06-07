-- Leadership / operations expenses are club-wide and not tied to a team.

-- Team is no longer mandatory: leadership expenses carry a null team_id.
alter table public.purchase_logs
  alter column team_id drop not null;

-- Distinguish team purchases from leadership / operations purchases.
alter table public.purchase_logs
  add column if not exists expense_type text not null default 'team'
  check (expense_type in ('team', 'leadership'));

-- A team expense must name a team; a leadership expense must not.
alter table public.purchase_logs
  drop constraint if exists purchase_logs_expense_scope_check;

alter table public.purchase_logs
  add constraint purchase_logs_expense_scope_check
  check (
    (expense_type = 'team' and team_id is not null)
    or (expense_type = 'leadership' and team_id is null)
  );

create index if not exists idx_purchase_logs_expense_type on public.purchase_logs(expense_type);
