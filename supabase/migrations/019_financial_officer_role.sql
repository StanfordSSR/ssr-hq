alter table public.profiles
  add column if not exists is_financial_officer boolean not null default false;

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'president', 'financial_officer', 'team_lead'));

update public.profiles
set is_financial_officer = coalesce(is_financial_officer, false) or role = 'financial_officer';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, is_admin, is_president, is_financial_officer, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead'),
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'admin',
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'president',
    coalesce(new.raw_user_meta_data ->> 'role', 'team_lead') = 'financial_officer',
    true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    role = excluded.role,
    is_admin = profiles.is_admin or excluded.is_admin,
    is_president = profiles.is_president or excluded.is_president,
    is_financial_officer = profiles.is_financial_officer or excluded.is_financial_officer,
    active = true;

  return new;
end;
$$;
