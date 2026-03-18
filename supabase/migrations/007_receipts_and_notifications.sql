alter table public.purchase_logs
  add column if not exists receipt_path text,
  add column if not exists receipt_file_name text,
  add column if not exists receipt_uploaded_at timestamptz;

create table if not exists public.receipt_notification_settings (
  id integer primary key default 1 check (id = 1),
  email_enabled boolean not null default true,
  reminder_days integer[] not null default '{3,7}',
  updated_at timestamptz not null default now()
);

insert into public.receipt_notification_settings (id, email_enabled, reminder_days)
values (1, true, '{3,7}')
on conflict (id) do nothing;

create table if not exists public.receipt_reminder_events (
  purchase_log_id uuid not null references public.purchase_logs(id) on delete cascade,
  reminder_day integer not null check (reminder_day > 0),
  sent_at timestamptz not null default now(),
  primary key (purchase_log_id, reminder_day)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'purchase-receipts',
  'purchase-receipts',
  false,
  2097152,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
