-- Weekly (configurable) Slack nudges to people who sign in HQ but haven't
-- enrolled a verification signature yet — team leads (who approve higher-value
-- reimbursements), presidents, and financial officers.

alter table public.reimbursement_settings
  add column if not exists signature_reminder_enabled boolean not null default true,
  add column if not exists signature_reminder_interval_days integer not null default 7;

alter table public.reimbursement_settings
  drop constraint if exists reimbursement_settings_sig_reminder_interval_check;
alter table public.reimbursement_settings
  add constraint reimbursement_settings_sig_reminder_interval_check
  check (signature_reminder_interval_days between 1 and 365);

-- One row per user, tracking when we last nudged them so the daily cron only
-- sends once per configured interval.
create table if not exists public.signature_enrollment_reminders (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_sent_at timestamptz not null default now()
);

alter table public.signature_enrollment_reminders enable row level security;
