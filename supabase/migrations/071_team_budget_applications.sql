-- Team leads request the annual budget by category without editing the club plan.
-- Access is server-only: no anon or authenticated policies are granted.
create table if not exists public.team_budget_applications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  academic_year text not null,
  plan_id uuid references public.budget_plans(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  line_items jsonb not null default '[]'::jsonb check (jsonb_typeof(line_items) = 'array'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references public.profiles(id) on delete set null,
  unique (team_id, academic_year)
);

create index if not exists idx_team_budget_applications_year_status
  on public.team_budget_applications(academic_year, status);

alter table public.team_budget_applications enable row level security;
revoke all on public.team_budget_applications from anon, authenticated;
grant select, insert, update on public.team_budget_applications to service_role;
