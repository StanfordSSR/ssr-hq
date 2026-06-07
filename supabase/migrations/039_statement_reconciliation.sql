-- Year-end reconciliation: import official finance-office statements and match
-- each line item against purchases logged in the portal.

create table if not exists public.statement_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  item_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.statement_line_items (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references public.statement_imports(id) on delete set null,
  statement_date date,
  raw_date text,
  reference_number text,
  person_name text,
  description text not null,
  raw_reference text,
  amount_cents bigint not null,
  direction text not null default 'debit' check (direction in ('debit', 'credit')),
  -- Stable hash of the source row so re-uploading the same statement is idempotent.
  dedupe_key text unique,
  status text not null default 'unmatched'
    check (status in ('unmatched', 'auto_matched', 'assigned', 'disregarded')),
  matched_purchase_log_id uuid references public.purchase_logs(id) on delete set null,
  assigned_scope text check (assigned_scope in ('team', 'leadership', 'unknown')),
  assigned_team_id uuid references public.teams(id) on delete set null,
  created_purchase_log_id uuid references public.purchase_logs(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_statement_line_items_status on public.statement_line_items(status);
create index if not exists idx_statement_line_items_amount on public.statement_line_items(amount_cents desc);
