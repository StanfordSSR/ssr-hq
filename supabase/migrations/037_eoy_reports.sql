-- End of year report and summer plans.

-- Allow the shared notification queue to carry end-of-year report reminders.
alter table public.notification_queue
  drop constraint if exists notification_queue_notification_type_check;

alter table public.notification_queue
  add constraint notification_queue_notification_type_check
  check (notification_type in ('receipt', 'report', 'invite', 'eoy_report'));

-- Configurable settings for the end of year report (due date, reminders, prompts).
-- Editable by both admins and presidents from club settings.
create table if not exists public.eoy_report_settings (
  id integer primary key default 1 check (id = 1),
  due_month_day text not null default '06-20',
  email_enabled boolean not null default true,
  slack_enabled boolean not null default false,
  reminder_days integer[] not null default '{14,7,1}',
  questions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

insert into public.eoy_report_settings (id)
values (1)
on conflict (id) do nothing;

-- One end of year report per team per academic year. Heterogeneous answers
-- (yes/no, member selections, class-year distribution, summer plan, sign-offs)
-- are stored together in a structured JSON blob.
create table if not exists public.eoy_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  academic_year text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  data jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete cascade,
  unique(team_id, academic_year)
);

create index if not exists idx_eoy_reports_year on public.eoy_reports(academic_year);
