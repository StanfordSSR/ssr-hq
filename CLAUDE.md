# CLAUDE.md — Stanford Student Robotics HQ

Orientation for an agent picking this repo up cold. Read this before changing
anything; it encodes conventions and traps that aren't obvious from the code.

**What this is:** the internal operations portal for Stanford Student Robotics —
budgets, purchases, reimbursements, receipts, quarterly + year-end reports, team
rosters, a shared credit card, visitor agreements, and a separate training site.
Production: `hq.stanfordssr.org` (Vercel, deploys from `main`).

---

## 1. Stack and shape

- **Next.js 16 App Router**, TypeScript, React Server Components by default.
- **Supabase** (Postgres + Auth + Storage). Auth is magic-link.
- **Vercel** hosting + cron. **Vitest** for unit tests. ESLint via `npm run lint`.
- ~33 page routes, ~23 API routes, 68+ SQL migrations.

```
app/dashboard/        the portal (role-gated)
app/dashboard/actions.ts   ~6,250 lines, ~86 server actions  ← see §7
app/api/internal/     bot → HQ callbacks (bearer auth)
app/api/cron/         scheduled jobs (bearer auth)
app/submit/           PUBLIC login-free reimbursement intake
app/training/         separate training site (own host, own auth)
lib/                  business logic; pure logic lives here and IS tested
supabase/migrations/  NNN_name.sql, applied manually (see §9)
```

### Data access: service role everywhere
Server code uses `createAdminClient()` (service-role key), which **bypasses RLS**.
RLS is enabled on tables with **no policies** — anon/auth keys get nothing. This
is deliberate: authorization lives in application code, not in the database. So
**every server action and page must check roles itself.** There is no safety net.

---

## 2. Roles and permissions

Five roles: `admin`, `president`, `vice_president`, `financial_officer`,
`team_lead`. A person can hold several; they switch via a profile menu
(`hq_active_role` cookie). `getViewerContext()` in `lib/auth.ts` resolves the
active role and is request-cached with React `cache()`.

A role is held by **either** the `role` column **or** a boolean flag
(`is_president`, `is_financial_officer`, …). Always use the predicates in
`lib/auth.ts` — never compare `profile.role` directly.

**Rules that are easy to get wrong (all have tests — keep them passing):**

| Capability | Who |
|---|---|
| Approve/reject a reimbursement | **Only an active lead of that team** — not officers |
| Mark filed in Granted | **Financial officer + admin only** (`canFileInGranted`) |
| Edit budgets | admin (or via approved budget plan) |
| View finances | admin, president, VP, FO |
| Sign-to-approve above threshold | the team's lead, with an enrolled signature |

> A permission rule must exist in **exactly one place**. Both the UI gate and the
> server action import the same predicate. This was violated once (presidents
> could mark things filed in Granted because the page and the action each had
> their own copy of the list) — don't reintroduce duplicated role literals.

**VP is read-only finance.** They see what presidents see but cannot perform
finance writes.

---

## 3. Money: conventions that matter

- **All amounts are integer cents.** Never floats. Columns are `*_cents`.
- **All finance math lives in `lib/finance-math.ts`** — remaining, utilization,
  category totals, donut geometry, big-ticket filtering, date-range sums,
  allocation. It is pure and fully tested. **Do not re-implement this math inline
  in a page**; that duplication is exactly what caused numbers to drift between
  pages before. Import it.
- `remainingCents` deliberately **goes negative** when overspent (the UI shows
  "over by X"); `utilizationPercent` clamps 0–100 for bar widths.
- **Dates are Pacific.** Use `formatPacificDateKey()` (`YYYY-MM-DD`, sorts
  lexicographically). A purchase at 02:00 UTC belongs to the *previous* Pacific
  day — quarter and summer windows depend on this.
- **Academic year** is a `2025-26` string; the cycle rolls over in September.

### Summer spend is its own bucket
Not "leftover annual budget." A team's summer allowance is
`data.summer.predictedSpendCents` from their **submitted** year-end report
(drafts don't count). `lib/summer-spend.ts` rolls it up; `lib/team-expense-notify.ts`
computes the same number for the Slack notice leads get. **These two must agree** —
if you change one, change both.

### Gas reimbursement policy (a real policy, stated precisely)
Gas is reimbursed **by mileage at $0.70/mile**, capped at the number of miles the
gas actually covers, so payout never exceeds gas spend. (50 mi driven + $15 gas →
first 21.43 mi × $0.70 ≈ $15.) Submitters must upload **both** a route/mileage
document **and** gas receipts — enforced as ≥2 attachments. It is *not* a flat
IRS-rate mileage payment; don't "simplify" the wording.

---

## 4. Reimbursement flow (end to end)

1. Anyone opens **`/submit`** (no login). Picks team, types their name (matched
   against the team roster), purchase type, amount, Stanford **Granted R-number**
   (`R-119704`). Receipt screenshots are read by an OpenAI vision call to
   auto-fill. Off-campus submitters get a geo-triggered policy acknowledgement.
2. HQ Slack-pushes **every active lead** of that team.
3. Lead decides. Below a configurable dollar threshold → one Slack button. Above →
   must draw their **enrolled signature** on a tokenized link (`/approve-reimbursement/<token>`).
   Signature verified against their enrolled profile.
4. On approval the purchase is logged to the team budget.
5. **Financial officer** files it in the Stanford Granted portal, then marks it
   filed in HQ (`/dashboard/reimbursements` → "File in Granted" section, with a
   copy-R-number chip and a Granted link).

Threshold is configured at **Settings → Reminders tab → "Member reimbursements"**
(yes, it's buried there; regrouping settings by domain is a known TODO).

---

## 5. Slack bot integration

HQ never talks to Slack directly — it POSTs to a **separate bot service**.

**HQ → bot:** `sendSlackbotNotification()` in `lib/slackbot.ts` POSTs to
`SSR_SLACKBOT_NOTIFY_URL` with `Authorization: Bearer $SSR_SLACKBOT_NOTIFY_SECRET`,
10s timeout. Payload carries `idempotency_key`, a `type`, `recipient_emails`,
title/message, optional `cta_label`/`cta_url`, and `metadata`.

Types: `manual_message`, `receipt_reminder`, `report_reminder`, `task_assigned`,
`invite_reminder`, `budget_approval`, `reimbursement_approval`, `reimbursement_decided`.

Notifications addressed to the club (not a team) use the sentinel
`SLACKBOT_SYSTEM_TEAM_ID = '00000000-…-000000000000'` / name `SSR HQ`.

**Bot → HQ:** `app/api/internal/*`, all guarded by the **same** bearer secret:

| Route | Purpose |
|---|---|
| `reimbursement-approval` | lead tapped Approve/Reject in Slack |
| `reimbursement-status` | bot polls current state to re-sync messages |
| `budget-approval` | president approves a budget plan from Slack |
| `announcement-rsvp` | member RSVPs to an event from Slack |

**The full bot contract is `docs/slackbot-reimbursements.md` (241 lines)** — read
it before changing any payload shape. It is a published contract another codebase
builds against; changing a field silently breaks the bot.

Degradation: if the bot can't render a typed event, HQ retries the same payload as
`manual_message` **with** a link, so the human can still act.

---

## 6. Cron and background work

`vercel.json` runs `/api/cron/reminders` at 01:00 and 02:00 UTC daily, bearer-auth'd
with `CRON_SECRET`. It: processes the queued-notification batch, purges submission
footprints (60-day retention), sends signature-enrollment reminders, and purges
expired visitor agreements.

**The notification queue** (`lib/notification-queue.ts`) holds `receipt`, `report`,
`eoy_report`, and `invite` reminders. It is *rebuilt* by sweeping full tables.

> ⚠️ **Never rebuild the queue inside a user action's request path.** It used to
> run inline in 16 server actions and was the single biggest cause of multi-second
> saves. It now runs via `after()` (next/server) so the response is sent first, with
> the daily cron as backstop. Keep it that way.

---

## 7. Server actions and the toast system

Almost all writes go through server actions in `app/dashboard/actions.ts` (and
`teams/actions.ts`). They funnel through `runRedirectingAction()` — **the name is
historical: it no longer redirects.** It records the outcome in a short-lived
`hq_flash` cookie and returns; setting a cookie makes Next re-render the current
route in place, and the dashboard layout renders `<ActionToast>`.

This replaced a pattern where every action redirected to `?status=success&message=…`,
which caused visible URL flashes, full page re-renders, and polluted history.
**Don't reintroduce status query params.** For new interactive forms prefer
`useActionState` returning a result object (see `components/reimbursement-actions.tsx`).

`actions.ts` is ~6,250 lines and should be split by domain
(`actions/finances.ts`, `actions/reports.ts`, …) opportunistically — pure file
moves, no behavior change.

---

## 8. Design system ("collegiate")

Stanford cardinal `#8c1515`, ink `#1a1414`, **square corners**, serif display
(Source Serif / Georgia fallback), uppercase letterspaced labels, hairline rules.
Defined in `app/globals.css` (~8,000 lines — one stylesheet, no CSS-in-JS).

Three layers:

1. **`.th-*`** — the native system: `.th-mast` (cardinal masthead), `.th-stats`
   (scoreboard of clickable stat cells), `.th-section` (expandable `<details>`
   sections with a preview line + count), `.th-donut`, `.th-catbar`.
2. **`.hq-page.th-page`** — a **legacy adapter**: adding `th-page` to an old page's
   root re-skins its existing `hq-*` skeleton into the new language with no JSX
   changes. This is how all remaining dashboard pages were converted.
3. **`.th-public`** — same treatment for public pages (login, /submit, approve, visit).

**Trap:** `.th-page *` sets `border-radius: 0 !important`. Anything genuinely
circular (charts, avatars, toggles) **must** be added to the "Circles stay circles"
exemption block right below it — otherwise pie charts render as squares. This
has already bitten once.

### UI principles used here
- Dashboards show **state and exceptions, never navigation.** If a card would only
  say "go here for X", show X instead.
- A "Needs attention" section leads each dashboard, auto-open, and is **absent**
  when there's nothing wrong.
- Collapsed sections still carry a one-line preview and a count, so the page is
  readable without expanding anything.
- Numbers are doors: scoreboard cells link to the page that explains them.

---

## 9. Migrations — manual, and a real deploy gotcha

`supabase/migrations/NNN_description.sql`, sequential. **They are NOT applied
automatically.** A human runs them (Supabase CLI or SQL editor).

> ⚠️ If a migration adds a column a page reads, **merging the code before the
> migration is applied breaks production.** Say this explicitly when handing off a
> schema change. Data-only seeds follow the same pattern (see `053`, `070`) —
> resolve the team by `name ilike`, so they no-op safely if it doesn't exist.

---

## 10. Testing and CI

`npm test` (Vitest) — **187 tests**, all pure-logic, no DB. `.github/workflows/ci.yml`
runs **typecheck → lint → tests** on every push and PR.

CI deliberately does **not** run `next build`: Next's page-data collection connects
to Supabase and would need production credentials, making CI permanently red.
`tsc --noEmit` covers the same files; Vercel does the real build on deploy.

Well-covered: `finance-math`, roles/permissions, academic calendar, EOY helpers,
reimbursements, credit-card crypto and gates, signature verification, receipt
windows. **When you add pure logic, put it in `lib/` and test it** — that's the
convention that keeps math from drifting back into pages.

**Lint is at 0 errors. Keep it there** — CI gates on it. Two recurring rules:
`react-hooks/purity` (no `Date.now()`/`Math.random()` in a component body — hoist
to a module-scope helper) and no synchronous `setState` inside an effect (defer
with `requestAnimationFrame`).

---

## 11. Conventions

- **Comments explain *why*, not *what*.** Match the existing density.
- Batch independent queries into a single `Promise.all` — every page was converted
  from sequential awaits, don't regress it.
- Verify visual changes by rendering: write HTML using the real `globals.css`, run
  headless Chromium (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome
  --headless --screenshot`), and **look at it**. A JSX splice can typecheck and
  still be badly broken — that happened once (a whole section rendered inside a
  table cell).
- Work on a feature branch, open a PR, squash-merge to `main`.

---

## 12. Known TODO / next steps

- **Money hub**: merge `/finances`, `/expenses`, `/purchases`, `/receipts` into one
  tabbed page (they overlap confusingly today).
- **Settings regroup** by domain (Money / People / Reporting / System) — 9 tabs
  today, grouped by when features were built, not what they configure.
- **Split `actions.ts`** by domain.
- **Caching**: no `unstable_cache` anywhere yet. Slow-changing reads (teams,
  calendar, budgets, settings) should be tag-cached with `revalidateTag`.
- Tag-based revalidation instead of invalidating up to 5 route paths per action.

## Environment variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
Integrations: `SSR_SLACKBOT_NOTIFY_URL`, `SSR_SLACKBOT_NOTIFY_SECRET`, `CRON_SECRET`,
`RESEND_API_KEY`, `OPENAI_API_KEY` (receipt scanning), `CARD_ENCRYPTION_KEY`
(base64 of 32 random bytes, AES-256-GCM for the shared card),
`NEXT_PUBLIC_GRANTED_URL` (defaults to `https://granted.stanford.edu`).
