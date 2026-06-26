-- High value capital asset stewardship log.
--
-- Team leads must record every single piece of capital equipment costing over
-- $1,000 (one item, not a bundle of small parts, not travel). All club
-- equipment is the property of Stanford University, so each asset captures what
-- it is, what it cost, where it is stored, and a short stewardship
-- justification. Admins, presidents, vice presidents, and financial officers
-- can review every logged asset across the club.

create table if not exists public.high_value_assets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  logged_by uuid references public.profiles(id) on delete set null,
  item_name text not null,
  amount_cents bigint not null check (amount_cents > 100000),
  storage_location text not null check (storage_location in ('robotics_room','lab64','chip','other')),
  storage_location_other text,
  stewardship_note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_high_value_assets_team_id on public.high_value_assets(team_id);
create index if not exists idx_high_value_assets_created_at on public.high_value_assets(created_at desc);

drop trigger if exists high_value_assets_set_updated_at on public.high_value_assets;
create trigger high_value_assets_set_updated_at before update on public.high_value_assets
for each row execute function public.set_updated_at_timestamp();

-- This table is only ever touched through the service-role key (dashboard
-- server actions and reads), so RLS stays enabled with no policies: the
-- anon/auth keys get no direct access.
alter table public.high_value_assets enable row level security;
