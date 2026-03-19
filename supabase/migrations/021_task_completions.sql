create table if not exists public.task_completions (
  task_id uuid not null references public.tasks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz not null default now(),
  primary key (task_id, team_id)
);

create index if not exists task_completions_team_idx
on public.task_completions (team_id, completed_at desc);
