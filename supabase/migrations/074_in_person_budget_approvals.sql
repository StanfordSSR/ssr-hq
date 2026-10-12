-- Preserve signed, admin-certified meeting approvals without presenting them
-- as signatures verified in the portal.
alter table public.budget_approvals
  drop constraint if exists budget_approvals_source_check;

alter table public.budget_approvals
  add constraint budget_approvals_source_check
  check (source in ('portal', 'slack', 'in_person'));

alter table public.budget_approvals
  add column if not exists evidence_path text,
  add column if not exists evidence_sha256 text,
  add column if not exists certified_by uuid references public.profiles(id) on delete set null,
  add column if not exists certified_by_name text,
  add column if not exists certified_at timestamptz;

alter table public.budget_approvals
  drop constraint if exists budget_approvals_in_person_evidence_check;

alter table public.budget_approvals
  add constraint budget_approvals_in_person_evidence_check
  check (
    source <> 'in_person' or
    (
      signature is null and
      evidence_path is not null and
      evidence_sha256 ~ '^[0-9a-f]{64}$' and
      nullif(btrim(certified_by_name), '') is not null and
      certified_at is not null
    )
  );

alter table public.budget_approvals enable row level security;
revoke all on public.budget_approvals from anon, authenticated;
grant select, insert, update, delete on public.budget_approvals to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'budget-approval-evidence',
  'budget-approval-evidence',
  false,
  5242880,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
