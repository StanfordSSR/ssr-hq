-- Singleton encrypted card record. The plaintext (number/expiry/cvv/cardholder)
-- is only ever stored inside `cipher` (AES-256-GCM). No plaintext card data.
create table if not exists public.credit_card (
  id integer primary key default 1 check (id = 1),
  label text,
  cipher text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Admin's per-user access switch (the "slider"). A user can be granted the
-- ability to go through the agreement flow and view the card (later phases).
create table if not exists public.credit_card_grants (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists credit_card_grants_set_updated_at on public.credit_card_grants;
create trigger credit_card_grants_set_updated_at before update on public.credit_card_grants
for each row execute function public.set_updated_at_timestamp();

alter table public.credit_card enable row level security;
alter table public.credit_card_grants enable row level security;
