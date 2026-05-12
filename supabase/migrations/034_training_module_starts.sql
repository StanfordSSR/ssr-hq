-- Track when a member started a training module so the server can enforce a
-- minimum dwell time before accepting a completion.

create table if not exists public.training_module_starts (
  email text not null,
  module_slug text not null,
  started_at timestamptz not null default now(),
  primary key (email, module_slug)
);

create index if not exists idx_training_module_starts_email
  on public.training_module_starts (lower(email));

alter table public.training_module_starts enable row level security;
-- Access restricted to the service role from server-side code.
