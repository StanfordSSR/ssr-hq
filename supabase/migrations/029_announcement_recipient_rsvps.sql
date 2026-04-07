create table if not exists public.announcement_recipient_rsvps (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  team_roster_member_id uuid references public.team_roster_members(id) on delete set null,
  recipient_email text not null,
  response text not null check (response in ('yes', 'maybe', 'no')),
  responded_at timestamptz not null default now()
);

create unique index if not exists announcement_recipient_rsvps_email_idx
on public.announcement_recipient_rsvps (announcement_id, lower(recipient_email));

create index if not exists announcement_recipient_rsvps_announcement_idx
on public.announcement_recipient_rsvps (announcement_id, response);
