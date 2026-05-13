-- Track per-user chapter progress within a training module so members who
-- leave and return resume from the chapter they were last on.

alter table public.training_module_starts
  add column if not exists current_chapter integer not null default 0;
