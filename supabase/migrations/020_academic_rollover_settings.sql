alter table public.academic_calendar_settings
add column if not exists auto_rollover_enabled boolean not null default true;

update public.academic_calendar_settings
set auto_rollover_enabled = true
where auto_rollover_enabled is null;

create table if not exists public.academic_calendar_settings (
  id integer primary key,
  current_academic_year text not null,
  updated_at timestamptz not null default now(),
  auto_rollover_enabled boolean not null default true
);

insert into public.academic_calendar_settings (id, current_academic_year, auto_rollover_enabled)
values (1, '2025-26', true)
on conflict (id) do update
set auto_rollover_enabled = coalesce(public.academic_calendar_settings.auto_rollover_enabled, true);
