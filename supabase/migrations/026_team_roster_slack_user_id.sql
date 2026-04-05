alter table public.team_roster_members
add column if not exists slack_user_id text;

create unique index if not exists team_roster_members_slack_user_id_idx
on public.team_roster_members (slack_user_id)
where slack_user_id is not null;
