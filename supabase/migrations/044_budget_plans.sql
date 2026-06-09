-- Line-item budget planner: funding sources + expense line items (per-team
-- category sub-budgets, events, operations), source->expense allocations,
-- quarterly re-declarations, and dual-president signature approvals.

-- Window + behaviour config (singleton).
create table if not exists public.budget_plan_settings (
  id integer primary key default 1 check (id = 1),
  open_month_day text not null default '06-01',
  quarter_lead_days integer not null default 14,
  slack_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.budget_plan_settings (id) values (1) on conflict (id) do nothing;

-- One plan per (academic_year, version). Newest non-superseded is "the plan".
create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'superseded')),
  total_funding_cents bigint not null default 0,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (academic_year, version)
);
create index if not exists idx_budget_plans_year on public.budget_plans(academic_year);

-- Funding source line items: annual grant, reserves, sponsorships, etc.
create table if not exists public.budget_funding_sources (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  label text not null,
  kind text not null default 'other'
    check (kind in ('annual_grant', 'grant_reserves', 'sponsorship', 'other')),
  amount_cents bigint not null default 0,
  is_default_pool boolean not null default false,
  locked boolean not null default false,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_bfs_plan on public.budget_funding_sources(plan_id);
-- exactly one default pool (the annual grant that absorbs remainders) per plan
create unique index if not exists uq_bfs_default_pool
  on public.budget_funding_sources(plan_id) where is_default_pool;

-- Expense line items. For teams, one row per category sub-budget
-- (equipment/food/travel/other). For events/operations, category is null.
create table if not exists public.budget_expense_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  kind text not null default 'general'
    check (kind in ('team', 'event', 'operations', 'general')),
  team_id uuid references public.teams(id) on delete set null,
  category text check (category in ('equipment', 'food', 'travel', 'other')),
  label text not null,
  amount_cents bigint not null default 0,
  lock_cadence text not null default 'yearly'
    check (lock_cadence in ('yearly', 'quarterly', 'unlocked')),
  locked boolean not null default false,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_bei_plan on public.budget_expense_items(plan_id);
create index if not exists idx_bei_team on public.budget_expense_items(team_id);

-- Source -> expense allocations. Any unallocated remainder of an expense is
-- implicitly drawn from the default-pool source (computed, never stored).
create table if not exists public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  source_id uuid not null references public.budget_funding_sources(id) on delete cascade,
  expense_id uuid not null references public.budget_expense_items(id) on delete cascade,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (source_id, expense_id)
);
create index if not exists idx_balloc_plan on public.budget_allocations(plan_id);

-- A quarter's re-declaration of quarterly-locked sub-budgets.
create table if not exists public.budget_quarter_declarations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.budget_plans(id) on delete cascade,
  academic_year text not null,
  quarter text not null
    check (quarter in ('Autumn Quarter', 'Winter Quarter', 'Spring Quarter', 'Summer Quarter')),
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'superseded')),
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, quarter, version)
);
create index if not exists idx_bqd_plan on public.budget_quarter_declarations(plan_id);

-- Declared amount for a quarterly-locked sub-budget in a given quarter.
create table if not exists public.budget_quarterly_values (
  id uuid primary key default gen_random_uuid(),
  declaration_id uuid not null references public.budget_quarter_declarations(id) on delete cascade,
  expense_item_id uuid not null references public.budget_expense_items(id) on delete cascade,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  unique (declaration_id, expense_item_id)
);
create index if not exists idx_bqv_declaration on public.budget_quarterly_values(declaration_id);

-- One signature row per president per approvable target (plan or quarter).
create table if not exists public.budget_approvals (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('plan', 'quarter')),
  target_id uuid not null,
  president_id uuid not null references public.profiles(id) on delete cascade,
  president_email text not null,
  decision text not null check (decision in ('approved', 'rejected')),
  signature text,
  decided_at timestamptz not null default now(),
  source text not null default 'portal' check (source in ('portal', 'slack')),
  unique (target_type, target_id, president_id)
);
create index if not exists idx_budget_approvals_target
  on public.budget_approvals(target_type, target_id);
