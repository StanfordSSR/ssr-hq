-- Tracks which training modules each member has completed.
-- module_slug is application-side (modules are defined in code for now);
-- a future training_modules table can join in without breaking this shape.

create table if not exists public.training_completions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  module_slug text not null,
  score numeric,
  attempts integer not null default 1,
  completed_at timestamptz not null default now(),
  unique (email, module_slug)
);

create index if not exists idx_training_completions_email on public.training_completions (lower(email));
create index if not exists idx_training_completions_module on public.training_completions (module_slug);

alter table public.training_completions enable row level security;
-- Access restricted to the service role from server-side code.
