alter table public.teams
  add column if not exists logo_url text;

create table if not exists public.club_budgets (
  academic_year text primary key,
  total_budget_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.team_budgets (
  team_id uuid not null references public.teams(id) on delete cascade,
  academic_year text not null,
  annual_budget_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (team_id, academic_year)
);

create table if not exists public.purchase_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  academic_year text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  recipient_scope text not null check (recipient_scope in ('all_teams', 'specific_teams')),
  push_notification boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.task_recipients (
  task_id uuid not null references public.tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  primary key (task_id, team_id)
);
