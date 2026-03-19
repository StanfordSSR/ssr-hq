alter table public.academic_calendar_settings
add column if not exists auto_rollover_enabled boolean not null default true;

update public.academic_calendar_settings
set auto_rollover_enabled = true
where auto_rollover_enabled is null;
