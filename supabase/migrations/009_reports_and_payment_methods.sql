alter table public.purchase_logs
  drop constraint if exists purchase_logs_payment_method_check;

alter table public.purchase_logs
  add constraint purchase_logs_payment_method_check
  check (payment_method in ('reimbursement', 'credit_card', 'amazon', 'unknown'));

create table if not exists public.report_questions (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  field_type text not null check (field_type in ('short_text', 'long_text', 'member_count')),
  word_limit integer not null default 150 check (word_limit > 0 and word_limit <= 5000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  academic_year text not null,
  quarter text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id) on delete cascade,
  unique(team_id, academic_year, quarter)
);

create table if not exists public.team_report_answers (
  report_id uuid not null references public.team_reports(id) on delete cascade,
  question_id uuid not null references public.report_questions(id) on delete cascade,
  answer text,
  updated_at timestamptz not null default now(),
  primary key (report_id, question_id)
);

create table if not exists public.report_notification_settings (
  id integer primary key default 1 check (id = 1),
  email_enabled boolean not null default true,
  reminder_days integer[] not null default '{14,7,1}',
  updated_at timestamptz not null default now()
);

insert into public.report_notification_settings (id, email_enabled, reminder_days)
values (1, true, '{14,7,1}')
on conflict (id) do nothing;

insert into public.report_questions (prompt, field_type, word_limit, sort_order)
select *
from (
  values
    ('Team member count', 'member_count', 25, 0),
    ('What did your team accomplish this quarter?', 'long_text', 250, 1),
    ('What blockers or risks are you facing right now?', 'long_text', 180, 2),
    ('What are your team''s top priorities for the next quarter?', 'long_text', 180, 3),
    ('Any budget, purchasing, or resource needs the club should know about?', 'long_text', 150, 4)
) as seed(prompt, field_type, word_limit, sort_order)
where not exists (
  select 1 from public.report_questions
);
