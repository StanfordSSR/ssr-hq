alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = lower(u.email)
from auth.users u
where p.id = u.id
  and u.email is not null
  and (p.email is null or p.email <> lower(u.email));

create unique index if not exists profiles_email_unique_idx
on public.profiles (lower(email));

create index if not exists team_memberships_user_active_idx
on public.team_memberships (user_id, is_active);

create index if not exists teams_active_idx
on public.teams (is_active);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, is_admin, is_president, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead'),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'admin',
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'president',
    true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    is_admin = profiles.is_admin or excluded.is_admin,
    is_president = profiles.is_president or excluded.is_president,
    active = true;

  return new;
end;
$$;
