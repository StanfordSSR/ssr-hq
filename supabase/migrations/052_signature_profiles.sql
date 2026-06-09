-- Enrolled signature reference profiles for officers who sign (presidents,
-- vice presidents, financial officers). Stores only the derived feature
-- statistics, not the raw signatures.
create table if not exists public.signature_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,            -- { mean[], std[], threshold, sampleCount }
  sample_count int not null default 0,
  updated_at timestamptz not null default now()
);
