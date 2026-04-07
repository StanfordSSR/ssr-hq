create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  location text not null,
  event_at timestamptz not null,
  recipient_scope text not null check (recipient_scope in ('all_teams', 'specific_teams')),
  created_by uuid not null references public.profiles(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_recipients (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  primary key (announcement_id, team_id)
);

create index if not exists announcements_active_event_idx
on public.announcements (is_active, event_at);

create index if not exists announcement_recipients_team_idx
on public.announcement_recipients (team_id);
