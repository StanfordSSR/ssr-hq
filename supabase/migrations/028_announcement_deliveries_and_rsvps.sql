create table if not exists public.announcement_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  recipient_email text not null,
  status text not null check (status in ('queued', 'sent', 'failed')) default 'queued',
  sent_at timestamptz,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists announcement_deliveries_announcement_idx
on public.announcement_deliveries (announcement_id, status, created_at);

create unique index if not exists announcement_deliveries_unique_recipient_idx
on public.announcement_deliveries (announcement_id, lower(recipient_email));

create table if not exists public.announcement_rsvps (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response text not null check (response in ('yes', 'maybe', 'no')),
  responded_at timestamptz not null default now(),
  primary key (announcement_id, profile_id)
);

create index if not exists announcement_rsvps_announcement_idx
on public.announcement_rsvps (announcement_id, response);
