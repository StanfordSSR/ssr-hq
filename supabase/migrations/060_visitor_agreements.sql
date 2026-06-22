-- External visitor access agreements.
--
-- A president (or admin) generates an unguessable contract link from their
-- dashboard, picks an access date range, and signs it (their drawn signature is
-- verified against their enrolled signature profile). The link opens a public
-- legal contract that an external visitor reads, fills in their details, and
-- signs once (their IP and user agent are logged). On submit, the visitor is
-- emailed a badge link backed by a second unguessable token; the badge page
-- shows an animated, screenshot-resistant SSR badge valid until the access end
-- date. Expired agreements are purged by the daily cron.
--
-- Like the other public-intake tables, these rows are only ever touched through
-- the service-role key (the public visit/badge routes and the dashboard issue
-- route), so RLS stays enabled with no policies: the anon/auth keys get no
-- direct access.

create table if not exists public.visitor_agreements (
  id uuid primary key default gen_random_uuid(),
  -- Unguessable token backing the public contract link the president shares.
  contract_token text not null unique,
  -- Unguessable token backing the public badge link, minted once signed.
  badge_token text unique,
  issued_by uuid references public.profiles(id) on delete set null,
  issuer_name text not null,
  access_start date not null,
  access_end date not null,
  issuer_signature text,
  status text not null default 'pending' check (status in ('pending', 'signed')),
  participant_name text,
  participant_university text,
  participant_dob date,
  participant_email text,
  participant_phone text,
  participant_signature text,
  acknowledgements jsonb,
  signed_at timestamptz,
  signer_ip text,
  signer_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visitor_agreements_access_end on public.visitor_agreements(access_end);
create index if not exists idx_visitor_agreements_badge_token on public.visitor_agreements(badge_token);

drop trigger if exists visitor_agreements_set_updated_at on public.visitor_agreements;
create trigger visitor_agreements_set_updated_at before update on public.visitor_agreements
for each row execute function public.set_updated_at_timestamp();

alter table public.visitor_agreements enable row level security;
