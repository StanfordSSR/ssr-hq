-- Run this manually in Supabase SQL editor after inviting yourself.
-- Replace the email below with your real admin email.

update public.profiles
set role = 'admin', active = true
where id = (
  select id from auth.users where email = 'artash@stanford.edu'
);
