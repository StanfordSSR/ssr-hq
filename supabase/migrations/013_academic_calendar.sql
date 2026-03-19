create table if not exists public.academic_calendar_settings (
  id integer primary key,
  current_academic_year text not null,
  updated_at timestamptz not null default now()
);

insert into public.academic_calendar_settings (id, current_academic_year)
values (1, '2025-26')
on conflict (id) do nothing;

create table if not exists public.academic_quarter_ranges (
  id uuid primary key default gen_random_uuid(),
  academic_year text not null,
  quarter text not null,
  sort_order integer not null,
  start_date date not null,
  end_date date not null,
  updated_at timestamptz not null default now(),
  unique (academic_year, quarter),
  check (quarter in ('Autumn Quarter', 'Winter Quarter', 'Spring Quarter', 'Summer Quarter'))
);

insert into public.academic_quarter_ranges (academic_year, quarter, sort_order, start_date, end_date)
values
  ('2025-26', 'Autumn Quarter', 1, '2025-09-22', '2025-12-12'),
  ('2025-26', 'Winter Quarter', 2, '2026-01-05', '2026-03-20'),
  ('2025-26', 'Spring Quarter', 3, '2026-03-30', '2026-06-10'),
  ('2025-26', 'Summer Quarter', 4, '2026-06-22', '2026-08-15')
on conflict (academic_year, quarter) do nothing;
