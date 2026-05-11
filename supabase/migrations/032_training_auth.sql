-- Training subsite auth: email-OTP login gated on team_roster_members.
-- Roster-only members never enter auth.users; their session lives entirely here.

create table if not exists public.training_otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts integer not null default 0,
  request_ip text,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_otp_codes_email_active
  on public.training_otp_codes (lower(email), created_at desc)
  where consumed_at is null;

create index if not exists idx_training_otp_codes_expires_at
  on public.training_otp_codes (expires_at);

create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_training_sessions_email on public.training_sessions (lower(email));
create index if not exists idx_training_sessions_expires_at on public.training_sessions (expires_at);

-- Tables are accessed exclusively via the service role from server-side code.
alter table public.training_otp_codes enable row level security;
alter table public.training_sessions enable row level security;

-- No policies = anon/authenticated keys cannot read or write. Service role bypasses RLS.
