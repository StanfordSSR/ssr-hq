-- Public, login-free reimbursement intake.
--
-- Any team member (no portal account required) can submit a purchase they paid
-- for at hq.stanfordssr.org/submit. Their name is matched against the team
-- roster, they attach the Stanford Granted R-number, and a Slack push is sent
-- to the team lead(s) to approve or reject. Small amounts can be approved with
-- a single Slack button; amounts over a configurable threshold require the
-- lead to draw their enrolled signature on a tokenized approval link. Once a
-- lead approves, the purchase is logged into that team's budget and surfaced to
-- financial officers (with the R-code) so they can finalize it in Granted.

-- Club-wide reimbursement settings (singleton row).
create table if not exists public.reimbursement_settings (
  id integer primary key default 1 check (id = 1),
  -- At or below this amount a lead can approve with a single Slack button.
  -- Above it, the lead must sign on the tokenized approval link.
  signature_threshold_cents bigint not null default 10000 check (signature_threshold_cents >= 0),
  -- When false, the public /submit page is closed.
  intake_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.reimbursement_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.member_reimbursements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  -- Free-typed by the submitter, then matched to a roster record.
  submitter_name text not null,
  roster_member_id uuid references public.team_roster_members(id) on delete set null,
  matched_profile_id uuid references public.profiles(id) on delete set null,
  item_name text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  -- Stanford Granted reimbursement number, e.g. R-119704.
  reimbursement_number text not null,
  academic_year text not null,
  receipt_path text,
  receipt_file_name text,
  -- Unguessable token backing the public approve/reject link sent over Slack.
  decision_token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Whether this submission needs a drawn signature to approve (set at submit
  -- time from the amount vs. the configured threshold).
  requires_signature boolean not null default false,
  -- How the decision was made once decided: a Slack/portal button or a signature.
  approval_kind text check (approval_kind in ('button', 'signature')),
  decided_by_profile_id uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  signature_score numeric,
  signature_threshold numeric,
  -- The budget ledger entry created when approved.
  locked_purchase_log_id uuid references public.purchase_logs(id) on delete set null,
  -- Financial-officer bookkeeping: marked once filed/approved in Granted.
  finance_processed_at timestamptz,
  finance_processed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_member_reimbursements_team_id
  on public.member_reimbursements(team_id);
create index if not exists idx_member_reimbursements_status
  on public.member_reimbursements(status);
create index if not exists idx_member_reimbursements_created_at
  on public.member_reimbursements(created_at desc);

drop trigger if exists member_reimbursements_set_updated_at on public.member_reimbursements;
create trigger member_reimbursements_set_updated_at
before update on public.member_reimbursements
for each row
execute function public.set_updated_at_timestamp();

drop trigger if exists reimbursement_settings_set_updated_at on public.reimbursement_settings;
create trigger reimbursement_settings_set_updated_at
before update on public.reimbursement_settings
for each row
execute function public.set_updated_at_timestamp();

-- These tables are only ever touched through the service-role key (public
-- intake routes and dashboard server actions), so RLS stays enabled with no
-- policies: the anon/auth keys get no direct access.
alter table public.reimbursement_settings enable row level security;
alter table public.member_reimbursements enable row level security;
