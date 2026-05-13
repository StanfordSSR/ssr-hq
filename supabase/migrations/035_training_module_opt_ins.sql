-- Records when a member opts in to a training module that is "available" but
-- not required for everyone (e.g. room-access training, which only members who
-- want physical access to the robotics room need to complete).
--
-- Once a row exists for (email, module_slug), the gating helper treats that
-- module as required for that user until completion.

create table if not exists public.training_module_opt_ins (
  email text not null,
  module_slug text not null,
  opted_in_at timestamptz not null default now(),
  primary key (email, module_slug)
);

create index if not exists idx_training_module_opt_ins_email
  on public.training_module_opt_ins (lower(email));

alter table public.training_module_opt_ins enable row level security;
-- Access restricted to the service role from server-side code.
