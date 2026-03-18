-- 003_teams.sql

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_role text not null check (team_role in ('lead')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create index if not exists idx_team_memberships_team_id
  on public.team_memberships(team_id);

create index if not exists idx_team_memberships_user_id
  on public.team_memberships(user_id);