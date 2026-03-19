create table if not exists public.academic_calendar_templates (
  id integer primary key,
  autumn_start_md text not null,
  autumn_end_md text not null,
  winter_end_md text not null,
  spring_end_md text not null,
  summer_end_md text not null,
  updated_at timestamptz not null default now()
);

insert into public.academic_calendar_templates (
  id,
  autumn_start_md,
  autumn_end_md,
  winter_end_md,
  spring_end_md,
  summer_end_md
)
values (1, '09-22', '12-12', '03-20', '06-10', '08-15')
on conflict (id) do nothing;
