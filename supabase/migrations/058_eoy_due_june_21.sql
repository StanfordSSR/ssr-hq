-- Move the year-end (EOY) report deadline to June 21. The time of day is set in
-- code (getEoyWindow): 6 PM Pacific.
insert into public.eoy_report_settings (id, due_month_day)
values (1, '06-21')
on conflict (id) do update set due_month_day = '06-21', updated_at = now();
