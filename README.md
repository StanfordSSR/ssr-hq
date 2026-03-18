# Stanford Student Robotics HQ starter

A clean Next.js + Supabase starter for `hq.stanfordssr.org`.

## What this gives you

- polished landing page for Stanford Student Robotics HQ
- Supabase magic-link login
- protected dashboard
- admin-only user management base
- invite admins or team leads by email
- deactivate leads without deleting data
- Postgres-backed `profiles` table with roles

## Stack

- Next.js App Router
- TypeScript
- Supabase Auth + Postgres + Row Level Security
- Vercel-ready deployment

## 1. Create your Supabase project

Create a project, then copy these values into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

For production, set:

```bash
NEXT_PUBLIC_SITE_URL=https://hq.stanfordssr.org
```

## 2. Run the SQL migrations

In Supabase SQL Editor, run:

1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_seed_first_admin.sql` after you invite yourself

## 3. Configure auth URLs in Supabase

In Supabase Auth settings:

- Site URL: `http://localhost:3000`
- Additional Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://hq.stanfordssr.org/auth/callback`

## 4. Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 5. Create the first admin

Because this starter keeps admin powers locked down, bootstrap yourself like this:

1. Visit `/login`
2. Send yourself a magic link
3. Open it and create your user record
4. Run `002_seed_first_admin.sql` with your real email
5. Refresh `/dashboard`

Now you can invite team leads and other admins from inside the app.

## 6. Deploy to Vercel

- push this repo to GitHub
- import it in Vercel
- add the same environment variables in Vercel project settings
- add custom domain `hq.stanfordssr.org`
- create a DNS CNAME record pointing `hq` to Vercel's target

## Suggested next features

- teams table + lead assignments
- quarterly funding request forms
- receipt uploads to Supabase Storage
- budget ledger by category: food, equipment, travel
- member activity logging
- progress reports and admin reminders
- announcement / notification center
