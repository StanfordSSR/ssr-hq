-- The credit card access agreement + approval state machine. A user the admin
-- has granted access (credit_card_grants.enabled) signs the agreement (their
-- drawn signature is verified against their enrolled signature_profiles row).
-- It then goes to the Financial Officer to approve (FO signs with their own
-- enrolled signature) — or an admin can OVERRIDE and grant without an FO
-- signature. Access is only effective once status is 'approved' or 'overridden'.
create table if not exists public.credit_card_agreements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pending_fo' check (status in ('pending_fo','approved','overridden')),
  user_team_name text,
  user_signed_at timestamptz not null default now(),
  user_signature text,
  user_signature_score numeric,
  fo_user_id uuid references public.profiles(id) on delete set null,
  fo_signed_at timestamptz,
  fo_signature text,
  override_by uuid references public.profiles(id) on delete set null,
  override_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists credit_card_agreements_set_updated_at on public.credit_card_agreements;
create trigger credit_card_agreements_set_updated_at before update on public.credit_card_agreements
for each row execute function public.set_updated_at_timestamp();

alter table public.credit_card_agreements enable row level security;
