alter table public.member_reimbursements
  add column if not exists slack_delivery_status text not null default 'untracked',
  add column if not exists slack_delivery_key text,
  add column if not exists slack_delivery_attempts integer not null default 0,
  add column if not exists slack_delivery_results jsonb not null default '[]'::jsonb,
  add column if not exists slack_delivery_target_emails jsonb not null default '[]'::jsonb,
  add column if not exists slack_delivery_error text,
  add column if not exists slack_delivery_requested_at timestamptz,
  add column if not exists slack_delivery_acknowledged_at timestamptz;

alter table public.member_reimbursements drop constraint if exists member_reimbursements_slack_delivery_status_check;
alter table public.member_reimbursements
  add constraint member_reimbursements_slack_delivery_status_check
  check (slack_delivery_status in ('untracked', 'pending', 'delivered', 'partial', 'failed', 'unknown'));
