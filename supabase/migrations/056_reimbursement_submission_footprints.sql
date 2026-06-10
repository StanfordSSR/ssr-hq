-- Security footprint for public reimbursement submissions.
--
-- The /submit page is public and login-free, so for each submission we record
-- the submitter's network footprint (IP, user agent, request geo) to support
-- abuse/fraud investigation. This is retained for 60 days and then purged by the
-- daily cron, while the reimbursement record itself is kept permanently.
--
-- We also record an explicit off-campus acknowledgement: when the submitter's
-- IP geolocates outside the greater Bay Area, the form makes them confirm they
-- are following policy for orders not shipped to campus.

alter table public.member_reimbursements
  add column if not exists off_campus_ack boolean not null default false;

create table if not exists public.reimbursement_submission_footprints (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid references public.member_reimbursements(id) on delete cascade,
  ip text,
  user_agent text,
  accept_language text,
  referer text,
  -- { country, region, city, latitude, longitude, outsideBayArea }
  geo jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reimbursement_footprints_reimbursement_id
  on public.reimbursement_submission_footprints(reimbursement_id);
create index if not exists idx_reimbursement_footprints_created_at
  on public.reimbursement_submission_footprints(created_at);

-- Service-role only, like the other reimbursement tables.
alter table public.reimbursement_submission_footprints enable row level security;
