-- Phase 3: the gated secure card VIEW. Two tables back the view-time gate.
--
-- credit_card_view_state: per-user snapshot of the last successful gate pass —
-- when they last signed the monthly/new-location verification, the last region
-- they viewed from, and whether they've ever opened the card (for the one-time
-- first-view reminder). No card data is ever stored here.
create table if not exists public.credit_card_view_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_signed_at timestamptz,
  last_region text,
  last_country text,
  first_viewed_at timestamptz,
  updated_at timestamptz not null default now()
);
drop trigger if exists credit_card_view_state_set_updated_at on public.credit_card_view_state;
create trigger credit_card_view_state_set_updated_at before update on public.credit_card_view_state
for each row execute function public.set_updated_at_timestamp();

-- credit_card_region_approvals: the card is only viewable inside North America,
-- and inside North America only from California by default. Viewing from any
-- other (non-CA) region requires a Financial Officer to approve that location.
-- One row per (user, region) — pending until an FO approves it.
create table if not exists public.credit_card_region_approvals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  region_key text not null,
  country text,
  region text,
  status text not null default 'pending' check (status in ('pending','approved')),
  requested_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  primary key (user_id, region_key)
);
alter table public.credit_card_view_state enable row level security;
alter table public.credit_card_region_approvals enable row level security;
