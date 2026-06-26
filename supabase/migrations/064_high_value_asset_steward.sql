-- Club-owned high value assets can be stewarded by a team or by Robotics Club
-- leadership (no specific team). Mirror the purchase_logs team/leadership scope.
alter table public.high_value_assets
  alter column team_id drop not null;

alter table public.high_value_assets
  add column if not exists steward_scope text not null default 'team'
  check (steward_scope in ('team', 'leadership'));

alter table public.high_value_assets
  drop constraint if exists high_value_assets_steward_scope_check;

alter table public.high_value_assets
  add constraint high_value_assets_steward_scope_check
  check (
    (steward_scope = 'team' and team_id is not null)
    or (steward_scope = 'leadership' and team_id is null)
  );
