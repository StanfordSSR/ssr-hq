-- Purchase classification + multi-file attachments for member reimbursements.
--
-- The public /submit intake now asks for a purchase type (equipment, event
-- food, travel, or other). Travel submissions pick a sub-type (vehicle rental,
-- gas reimbursement, or food). Gas-reimbursement submissions must upload BOTH a
-- route/mileage document and their gas receipts (the club reimburses gas only up
-- to $0.70/mile), so a single receipt column is no longer enough — attachments
-- move into their own table while receipt_path/receipt_file_name are kept as the
-- primary attachment for backward compatibility with the approval + ledger flow.

alter table public.member_reimbursements
  add column if not exists purchase_type text
    check (purchase_type in ('equipment', 'event_food', 'travel', 'other')),
  add column if not exists travel_subtype text
    check (travel_subtype in ('vehicle_rental', 'gas_reimbursement', 'food'));

-- All files attached to a reimbursement. The first uploaded file is also mirrored
-- onto member_reimbursements.receipt_path so existing code paths keep working.
create table if not exists public.reimbursement_attachments (
  id uuid primary key default gen_random_uuid(),
  reimbursement_id uuid not null references public.member_reimbursements(id) on delete cascade,
  path text not null,
  file_name text,
  -- Ordinal upload position (0 = primary), used for stable display ordering.
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_reimbursement_attachments_reimbursement_id
  on public.reimbursement_attachments(reimbursement_id);

-- Service-role-only, matching member_reimbursements: RLS on, no policies.
alter table public.reimbursement_attachments enable row level security;
