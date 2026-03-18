create table if not exists public.team_roster_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null,
  stanford_email text not null,
  joined_month integer not null check (joined_month between 1 and 12),
  joined_year integer not null check (joined_year between 2000 and 2100),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_roster_members_team_id
  on public.team_roster_members(team_id);
