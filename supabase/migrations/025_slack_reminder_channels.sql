alter table public.receipt_notification_settings
add column if not exists slack_enabled boolean not null default false;

alter table public.report_notification_settings
add column if not exists slack_enabled boolean not null default false;

create table if not exists public.invite_notification_settings (
  id integer primary key default 1 check (id = 1),
  email_enabled boolean not null default true,
  slack_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.invite_notification_settings (id, email_enabled, slack_enabled)
values (1, true, false)
on conflict (id) do nothing;
