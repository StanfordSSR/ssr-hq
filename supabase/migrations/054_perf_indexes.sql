-- Performance indexes for the hottest query paths (finances / dashboard).
-- purchase_logs is filtered by expense_type + academic_year + team_id on nearly
-- every finance page; only expense_type was indexed before.
create index if not exists idx_purchase_logs_scope
  on public.purchase_logs(expense_type, academic_year, team_id);

create index if not exists idx_purchase_logs_team
  on public.purchase_logs(team_id);

create index if not exists idx_purchase_logs_purchased_at
  on public.purchase_logs(purchased_at desc);

-- Profiles are scanned by active/role in several admin/settings views.
create index if not exists idx_profiles_active on public.profiles(active);
