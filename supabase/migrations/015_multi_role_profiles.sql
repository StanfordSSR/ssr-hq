alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_president boolean not null default false;

update public.profiles
set
  is_admin = coalesce(is_admin, false) or role = 'admin',
  is_president = coalesce(is_president, false) or role = 'president';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, is_admin, is_president, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead'),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'admin',
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'president',
    true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    is_admin = profiles.is_admin or excluded.is_admin,
    is_president = profiles.is_president or excluded.is_president,
    active = true;

  return new;
end;
$$;
