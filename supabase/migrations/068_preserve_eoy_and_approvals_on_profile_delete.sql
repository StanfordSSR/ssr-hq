-- Preserve year-end reports and budget approvals when a profile is deleted.
--
-- Migration 011 already converted authorship columns (created_by / updated_by)
-- to ON DELETE SET NULL so deleting a person's account never wipes shared team
-- records. But eoy_reports (037) and budget_approvals (044) were created AFTER
-- 011 and reintroduced ON DELETE CASCADE on their authorship columns. As a
-- result, deleting a person's account was cascade-deleting their team's
-- year-end report (and budget approval rows) even though the team still
-- existed. These records belong to the team / club, not the individual, so the
-- author reference should null out instead of taking the record with it.

alter table public.eoy_reports
  alter column updated_by drop not null;

alter table public.eoy_reports
  drop constraint if exists eoy_reports_updated_by_fkey;

alter table public.eoy_reports
  add constraint eoy_reports_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.budget_approvals
  alter column president_id drop not null;

alter table public.budget_approvals
  drop constraint if exists budget_approvals_president_id_fkey;

alter table public.budget_approvals
  add constraint budget_approvals_president_id_fkey
  foreign key (president_id) references public.profiles(id) on delete set null;
