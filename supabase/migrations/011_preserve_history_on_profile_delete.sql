alter table public.purchase_logs
  alter column created_by drop not null;

alter table public.purchase_logs
  drop constraint if exists purchase_logs_created_by_fkey;

alter table public.purchase_logs
  add constraint purchase_logs_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.tasks
  alter column created_by drop not null;

alter table public.tasks
  drop constraint if exists tasks_created_by_fkey;

alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.team_reports
  alter column updated_by drop not null;

alter table public.team_reports
  drop constraint if exists team_reports_updated_by_fkey;

alter table public.team_reports
  add constraint team_reports_updated_by_fkey
  foreign key (updated_by) references public.profiles(id) on delete set null;

alter table public.team_roster_members
  alter column created_by drop not null;

alter table public.team_roster_members
  drop constraint if exists team_roster_members_created_by_fkey;

alter table public.team_roster_members
  add constraint team_roster_members_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;
