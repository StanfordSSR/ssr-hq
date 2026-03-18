alter table public.report_questions
  drop constraint if exists report_questions_field_type_check;

alter table public.report_questions
  add constraint report_questions_field_type_check
  check (field_type in ('short_text', 'long_text', 'member_count', 'funds_spent'));

insert into public.report_questions (prompt, field_type, word_limit, sort_order)
select 'Funds spent this quarter', 'funds_spent', 30, 1
where not exists (
  select 1
  from public.report_questions
  where field_type = 'funds_spent'
    and is_active = true
);

create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null check (notification_type in ('receipt', 'report')),
  team_id uuid not null references public.teams(id) on delete cascade,
  source_key text not null unique,
  scheduled_for timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'cancelled', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists idx_notification_queue_status_scheduled_for
  on public.notification_queue(status, scheduled_for);

create table if not exists public.audit_log_entries (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  summary text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_entries_created_at
  on public.audit_log_entries(created_at desc);

create table if not exists public.cron_run_logs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  run_key text not null unique,
  created_at timestamptz not null default now()
);
