# Slack bot ↔ HQ contract: reimbursement approvals

Handoff spec for the SSR Slack bot. The HQ side (this repo) is deployed; everything
here is a fixed contract the bot builds against. If something seems missing, flag
it rather than inventing endpoints.

## Context — what this is

HQ (`hq.stanfordssr.org`) has a public, login-free reimbursement intake. Flow:

1. A team member opens `hq.stanfordssr.org/submit` (no account needed), picks their
   team, types their name (matched against the team roster), the item, the amount,
   and their Stanford **Granted reimbursement number** (`R-119704`). They can paste a
   receipt screenshot that an AI reads to auto-fill item + amount.
2. On submit, HQ sends a **Slack push to every active lead of that team** — the bot.
3. The lead approves or rejects. **Two modes**, decided by a club-configurable dollar
   threshold:
   - **At/below threshold** → a single Slack button settles it.
   - **Above threshold** → the lead must draw their enrolled signature on a tokenized
     web link (HQ verifies it). No button can settle these.
4. On approval, HQ logs the purchase into that team's budget and lists it (with the
   R-code) for financial officers to file in the Granted portal.

**Bot's job:** render the push, handle Approve/Reject buttons by calling HQ back, and
keep **all** of a team's leads' DMs in sync (when one co-lead acts, everyone's message
flips to "Approved by …").

## Secrets / config

- **`SSR_SLACKBOT_NOTIFY_SECRET`** — the shared bearer secret already used for HQ→bot
  notify. Reuse the *same* value to authenticate bot→HQ calls: `Authorization: Bearer <secret>`.
- **HQ base URL** — `https://hq.stanfordssr.org`.

## 1. Inbound push the bot receives from HQ

HQ POSTs to the bot's existing notify endpoint with a **new `type`**. (If unhandled,
HQ retries the same payload as `type: "manual_message"`, so the link still arrives —
but native buttons require handling the typed version.)

```jsonc
{
  "idempotency_key": "reimbursement_approval:<reimbursement_id>",
  "type": "reimbursement_approval",
  "team_id":   "00000000-0000-0000-0000-000000000000",  // SSR HQ system team
  "team_name": "SSR HQ",
  "recipient_emails": ["lead1@stanford.edu", "lead2@stanford.edu"], // ALL active leads of the team
  "title":   "Reimbursement to review — <Team Name>",
  "message": "<multiline summary: submitter, item, amount, Granted #, instruction>",
  "cta_label": "Review & sign",          // or "Review reimbursement" when no signature needed
  "cta_url":   "https://hq.stanfordssr.org/approve-reimbursement/<decision_token>",
  "metadata": {
    "reimbursement_id":      "<uuid>",   // ← key for callbacks, polling, and message grouping
    "team_id":               "<uuid>",
    "team_name":             "<string>",
    "amount_cents":          12345,
    "reimbursement_number":  "R-119704",
    "requires_signature":    false,      // ← HQ already computed this vs. the threshold; trust it
    "approve_url":           "https://hq.stanfordssr.org/approve-reimbursement/<decision_token>",
    "callback_path":         "/api/internal/reimbursement-approval"
  }
}
```

Keep returning the normal notify response shape to HQ:

```jsonc
{ "ok": true, "delivered": 2, "failed": 0, "results": [{ "email": "...", "ok": true, "slack_user_id": "U123" }] }
```

The **bot** posts the Slack DMs (HQ never talks to Slack directly), so the bot owns
each message's `(channel_id, message_ts)` — store them (see §4).

## 2. Rendering rules — driven entirely by `metadata.requires_signature`

- **`false`** → post the summary with **Approve** and **Reject** buttons. Encode
  `reimbursement_id` and the `decision` into each button (e.g. `action_id: "reimb_approve"`,
  `value: "<reimbursement_id>"`).
- **`true`** → **no buttons.** Post the summary with only the **Review & sign** link
  (`cta_url`). These are settled on the web page; HQ verifies the drawn signature
  against that team's leads. (The poll loop in §4 flips these later.)

DM each email in `recipient_emails` (resolve email → Slack user). Record every message
posted under `reimbursement_id`.

## 3. Button tap → call HQ back

```
POST https://hq.stanfordssr.org/api/internal/reimbursement-approval
Authorization: Bearer <SSR_SLACKBOT_NOTIFY_SECRET>
Content-Type: application/json

{
  "reimbursement_id": "<uuid from the button value>",
  "decision": "approved",          // or "rejected"
  "approver_email": "<clicking lead's email>"           // PREFERRED — resolve via Slack users.info
  // fallback if email is unavailable:
  // "approver_slack_user_id": "<Slack user id of clicker>"
}
```

**Identity:** send `approver_email` whenever possible (call Slack `users.info` on the
clicker and use their profile email). Only fall back to `approver_slack_user_id` if
email is unavailable — and that path only works if the lead's `slack_user_id` is already
linked in HQ's database, which is **not guaranteed**. HQ confirms the approver is an
**active lead of that reimbursement's team** before accepting.

**Response handling:**

| HTTP | Body | Meaning → action |
|---|---|---|
| 200 | `{ ok:true, status:"approved"\|"rejected" }` | Settled. Run message sync (§4): edit **all** stored messages for this `reimbursement_id`. |
| 200 | `{ ok:true, note:"Already approved.", status }` | A co-lead beat them to it (race). Sync all messages to `status`. Not an error. |
| 422 | `{ error, approve_url }` | Over the signature threshold — buttons can't settle it. Reply ephemeral: "This one needs a signature," linking `approve_url`. (Shouldn't happen if §2 is followed.) |
| 403 | `{ error }` | Clicker isn't an active lead of that team. Reply ephemeral with `error`. |
| 404 | `{ error }` | Reimbursement not found. |
| 401 | `{ error }` | Bad/missing bearer secret. |
| 400 | `{ error }` | Missing fields or a write race. Safe to re-fetch via the status poll (§4). |

HQ is **idempotent** and team-scoped — safe to leave both leads' buttons live;
concurrent taps can't double-log, the loser gets the "Already …" 200.

## 4. Keeping all leads' DMs in sync (incl. sign-link & in-portal decisions)

Persist, per `reimbursement_id`, every DM posted: `[{ channel_id, message_ts, recipient }]`.
On any settle, edit **all** of them.

**a) Button-driven settle** (from §3, status 200): immediately `chat.update` every
stored message → `✅ Approved by <name>` / `❌ Rejected by <name>`, remove the buttons.
Get `<name>` from the clicking user, or from the status endpoint below.

**b) Decisions made outside Slack** — the sign-link approval and the in-portal
approve/reject produce **no Slack event**. **Poll HQ** for any reimbursement still
pending on the bot's side:

```
GET https://hq.stanfordssr.org/api/internal/reimbursement-status?id=<uuid>
GET https://hq.stanfordssr.org/api/internal/reimbursement-status?ids=<uuid>,<uuid>,...   // batch, up to 200
Authorization: Bearer <SSR_SLACKBOT_NOTIFY_SECRET>

200 → {
  "ok": true,
  "results": [
    {
      "id": "<uuid>",
      "status": "pending" | "approved" | "rejected",
      "approval_kind": "button" | "signature" | null,
      "decided_by_name": "Jordan Lee" | null,
      "decided_at": "2026-06-10T18:22:01.000Z" | null,
      "finance_processed": false
    }
  ]
}
```

Poll loop: for each posted reimbursement still believed `pending`, poll periodically
(suggest **every 60s for ~60 min**, then stop). When `status !== "pending"`, run the
same message sync as §4a, using `decided_by_name` (append "(signed)" when
`approval_kind === "signature"`), then stop polling that id. Batch pending ids into one
`ids=` call. Ignore `finance_processed` (downstream finance bookkeeping, irrelevant to
the lead DMs).

> Skip the poll for items already settled via a button — only poll ones still pending
> on the bot's side (covers sign-link approvals and anything done from the HQ portal).

## 5. Suggested bot-side data model

```
reimbursement_pushes
  reimbursement_id   text  (pk)        -- from metadata.reimbursement_id
  team_id            text
  requires_signature boolean
  status             text  default 'pending'   -- local mirror
  created_at         timestamptz

reimbursement_messages
  reimbursement_id   text  (fk)
  channel_id         text
  message_ts         text
  recipient_email    text
  (pk: reimbursement_id, message_ts)
```

Settle = set local `status`, edit every `reimbursement_messages` row, stop polling.

## 6. Test checklist

- Below-threshold push → buttons render; Approve → HQ 200 → **both** leads' DMs flip
  to "Approved by X," buttons gone.
- Two leads tap near-simultaneously → one 200 success, the other "Already approved" →
  both DMs consistent.
- Reject → both flip to "Rejected by X."
- Above-threshold push → **no** buttons, link only → after the lead signs on the web
  page, the poll flips both DMs to "Approved by X (signed)."
- In-portal approve (lead clicks Approve inside HQ, never touches Slack) → the poll
  flips the DMs.
- Bad secret → 401; non-lead clicker → 403 ephemeral.

## 7. Fixed vs. open

- **Fixed (HQ live):** the `reimbursement_approval` push, `POST /api/internal/reimbursement-approval`,
  `GET /api/internal/reimbursement-status`, the threshold/signature logic, idempotency,
  and team-scoped auth.
- **Open (bot side):** rendering, the callback call, message-ref persistence, the
  cross-DM edit, and the poll loop. None requires further HQ changes — if something does,
  surface it back.

## HQ-side reference (where this is implemented)

- `lib/reimbursements.ts` — `sendReimbursementSlackPush` (the push payload).
- `app/api/internal/reimbursement-approval/route.ts` — native button callback.
- `app/api/internal/reimbursement-status/route.ts` — status poll.
- `app/api/submit/route.ts`, `app/submit/*` — public intake.
- `app/approve-reimbursement/[token]/*` — tokenized approve/sign page.
- `supabase/migrations/055_member_reimbursements.sql` — schema + settings.
