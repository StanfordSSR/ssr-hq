import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { encryptCard, decryptCard } from '@/lib/card-crypto';
import { env } from '@/lib/env';
import {
  getRoleLabel,
  profileHasFinancialOfficerRole,
  profileHasPresidentRole,
  profileHasVicePresidentRole,
  type Profile
} from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { extractSubmissionFootprint } from '@/lib/reimbursements';
import { pacificYearMonth } from '@/lib/receipt-month';
import {
  extractSignatureFeatures,
  parseStrokes,
  verifySignature,
  type SignatureProfile
} from '@/lib/signature-verify';

// Minimum seconds a user must spend on the agreement page before signing is
// accepted. Enforced client-side (countdown) and server-side (signed token).
export const CARD_AGREEMENT_MIN_READ_SECONDS = 120;

// HMAC-signed "issued at" token embedded in the agreement form. The server can
// then verify how long ago the page was rendered without trusting a client clock
// or a tamperable hidden field. Secret is the service-role key (server-only).
function readTokenSecret(): string {
  return env.serviceRoleKey || 'card-agreement-read-token';
}

export function issueCardReadToken(): string {
  const issuedAt = Math.floor(Date.now() / 1000).toString();
  const mac = createHmac('sha256', readTokenSecret()).update(issuedAt).digest('hex');
  return `${issuedAt}.${mac}`;
}

// Returns true only when the token is authentic AND at least
// CARD_AGREEMENT_MIN_READ_SECONDS have elapsed since it was issued.
export function cardReadTokenSatisfied(token: string | null | undefined, nowMs: number): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const issuedAt = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(issuedAt)) return false;

  const expected = createHmac('sha256', readTokenSecret()).update(issuedAt).digest('hex');
  const macBuf = Buffer.from(mac, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (macBuf.length !== expectedBuf.length || !timingSafeEqual(macBuf, expectedBuf)) {
    return false;
  }

  const elapsedSeconds = Math.floor(nowMs / 1000) - Number(issuedAt);
  return elapsedSeconds >= CARD_AGREEMENT_MIN_READ_SECONDS;
}

// The default "team label" snapshot when a signer leads no active team — they're
// signing in a club-wide leadership capacity (president / VP / financial officer).
export const CREDIT_CARD_DEFAULT_TEAM_LABEL = 'Robotics Club Leadership';

// The decrypted shape of the shared club card. This plaintext only ever lives
// in memory or inside the encrypted `cipher` column — never in plaintext at
// rest, in logs, or in the admin UI.
export type CreditCardFields = {
  number: string;
  expiry: string;
  cvv: string;
  cardholder: string;
};

// Lightweight metadata so the admin/settings UI can show that a card is on file
// without ever decrypting it. NEVER selects or returns `cipher`.
export async function getCreditCardMeta(): Promise<{
  exists: boolean;
  label: string | null;
  createdAt: string | null;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card')
    .select('id, label, created_at')
    .eq('id', 1)
    .maybeSingle();

  if (!data) {
    return { exists: false, label: null, createdAt: null };
  }

  return { exists: true, label: data.label ?? null, createdAt: data.created_at ?? null };
}

// Stores the one-time card entry. Once a row exists it can never be edited — the
// admin must delete it first. The plaintext is encrypted before it touches the
// database; only the resulting `cipher` is persisted.
export async function setCreditCard(fields: CreditCardFields, label: string, createdBy: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from('credit_card').select('id').eq('id', 1).maybeSingle();
  if (existing) {
    throw new Error('A card is already on file. Delete it first to set a new one.');
  }

  const cipher = encryptCard(JSON.stringify(fields));
  const { error } = await admin.from('credit_card').insert({
    id: 1,
    label: label || null,
    cipher,
    created_by: createdBy
  });

  if (error) {
    throw new Error(error.message);
  }
}

// Deletes the card record only. Per-user grants are intentionally left in place
// so the admin's access decisions survive re-entering a card later.
export async function deleteCreditCard(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('credit_card').delete().eq('id', 1);
  if (error) {
    throw new Error(error.message);
  }
}

// Decrypts and returns the stored card. EXISTS FOR LATER PHASES / SERVER USE
// ONLY. This must only ever be called for an authorized viewer (the agreement +
// approval gating is built in a later phase). It must NOT be surfaced in any
// admin/settings UI.
export async function getDecryptedCard(): Promise<CreditCardFields | null> {
  const admin = createAdminClient();
  const { data } = await admin.from('credit_card').select('cipher').eq('id', 1).maybeSingle();
  if (!data?.cipher) {
    return null;
  }

  return JSON.parse(decryptCard(data.cipher)) as CreditCardFields;
}

// The admin's per-user access switches.
export async function getCardGrants(): Promise<Array<{ user_id: string; enabled: boolean }>> {
  const admin = createAdminClient();
  const { data } = await admin.from('credit_card_grants').select('user_id, enabled');
  return ((data || []) as Array<{ user_id: string; enabled: boolean }>).map((row) => ({
    user_id: row.user_id,
    enabled: row.enabled
  }));
}

// Flips a single user's access switch (the "slider").
export async function setCardGrant(userId: string, enabled: boolean, grantedBy: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('credit_card_grants').upsert(
    {
      user_id: userId,
      enabled,
      granted_by: grantedBy,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

type EligibleCardUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  roleLabel: string;
};

// People who can be granted credit-card access: active team leads OR financial
// officers OR presidents OR vice presidents. Mirrors how lib/signature-reminders
// collects officers (role or flag, via .or(...)) plus active team-lead
// memberships, de-duped by profile id.
export async function getEligibleCardUsers(): Promise<EligibleCardUser[]> {
  const admin = createAdminClient();

  const [{ data: officers }, { data: leadMemberships }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, email, role, is_president, is_vice_president, is_financial_officer')
      .eq('active', true)
      .or(
        'role.eq.president,role.eq.vice_president,role.eq.financial_officer,is_president.eq.true,is_vice_president.eq.true,is_financial_officer.eq.true'
      ),
    admin.from('team_memberships').select('user_id').eq('team_role', 'lead').eq('is_active', true)
  ]);

  type EligibleProfile = Pick<
    Profile,
    'id' | 'full_name' | 'email' | 'role' | 'is_president' | 'is_vice_president' | 'is_financial_officer'
  >;

  const leadIds = Array.from(new Set((leadMemberships || []).map((m) => m.user_id)));
  let leadProfiles: EligibleProfile[] = [];
  if (leadIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, full_name, email, role, is_president, is_vice_president, is_financial_officer')
      .in('id', leadIds)
      .eq('active', true);
    leadProfiles = (data as EligibleProfile[]) || [];
  }

  const isLead = new Set(leadProfiles.map((p) => p.id));

  // Union of all eligible profiles, de-duped by id.
  const byId = new Map<string, EligibleProfile>();
  for (const p of (officers as EligibleProfile[]) || []) byId.set(p.id, p);
  for (const p of leadProfiles) byId.set(p.id, p);

  // Pick the most senior role label for display: president > vice president >
  // financial officer > team lead.
  const roleLabelFor = (profile: EligibleProfile): string => {
    if (profileHasPresidentRole(profile)) return getRoleLabel('president');
    if (profileHasVicePresidentRole(profile)) return getRoleLabel('vice_president');
    if (profileHasFinancialOfficerRole(profile)) return getRoleLabel('financial_officer');
    if (isLead.has(profile.id)) return getRoleLabel('team_lead');
    return getRoleLabel('team_lead');
  };

  return Array.from(byId.values())
    .map((profile) => ({
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email ?? null,
      roleLabel: roleLabelFor(profile)
    }))
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
}

// --- Phase 2: access agreement + approval state machine --------------------

export type CreditCardAgreementStatus = 'pending_fo' | 'approved' | 'overridden';

export type CreditCardAgreement = {
  user_id: string;
  status: CreditCardAgreementStatus;
  user_team_name: string | null;
  user_signed_at: string;
  user_signature: string | null;
  user_signature_score: number | null;
  fo_user_id: string | null;
  fo_signed_at: string | null;
  fo_signature: string | null;
  override_by: string | null;
  override_at: string | null;
  created_at: string;
  updated_at: string;
};

const CREDIT_CARD_AGREEMENT_COLUMNS =
  'user_id, status, user_team_name, user_signed_at, user_signature, user_signature_score, fo_user_id, fo_signed_at, fo_signature, override_by, override_at, created_at, updated_at';

// The single agreement row for a user, or null if they have not signed yet.
export async function getCardAgreement(userId: string): Promise<CreditCardAgreement | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card_agreements')
    .select(CREDIT_CARD_AGREEMENT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as CreditCardAgreement | null) ?? null;
}

// Whether the admin's per-user access switch ("slider") is on for this user.
export async function isCardGrantEnabled(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card_grants')
    .select('enabled')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data?.enabled);
}

// The Phase 3 gate: a user can actually view the card only when the admin's
// grant is on AND their agreement has cleared approval (FO-signed or overridden).
export async function canAccessCard(userId: string): Promise<boolean> {
  const [enabled, agreement] = await Promise.all([isCardGrantEnabled(userId), getCardAgreement(userId)]);
  if (!enabled || !agreement) return false;
  return agreement.status === 'approved' || agreement.status === 'overridden';
}

export type PendingCardAgreement = {
  userId: string;
  fullName: string | null;
  teamName: string | null;
  signedAt: string;
};

// Agreements awaiting Financial Officer approval, newest first, with the
// requesting user's name resolved from profiles.
export async function getPendingCardAgreements(): Promise<PendingCardAgreement[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card_agreements')
    .select('user_id, user_team_name, user_signed_at')
    .eq('status', 'pending_fo')
    .order('user_signed_at', { ascending: false });

  const rows = (data || []) as Array<{ user_id: string; user_team_name: string | null; user_signed_at: string }>;
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: profilesData } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  const nameById = new Map(
    ((profilesData || []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [
      p.id,
      p.full_name || p.email
    ])
  );

  return rows.map((row) => ({
    userId: row.user_id,
    fullName: nameById.get(row.user_id) ?? null,
    teamName: row.user_team_name,
    signedAt: row.user_signed_at
  }));
}

// Verify a drawn signature against ONE specific user's enrolled signature
// profile. Mirrors verifyReimbursementSignature, but scoped to a single user:
// the signer (a granted user signing the agreement, or the FO signing to
// approve) signs with their own enrolled signature. Throws a user-facing error
// when not enrolled or when the signature doesn't match.
export async function verifyUserSignature(
  userId: string,
  rawStrokes: unknown
): Promise<{ score: number; threshold: number }> {
  const features = extractSignatureFeatures(parseStrokes(rawStrokes));
  if (!features) {
    throw new Error('That signature was too brief to verify — please sign again.');
  }

  const admin = createAdminClient();
  const { data: profileRow } = await admin
    .from('signature_profiles')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profileRow?.profile) {
    throw new Error('You must enroll your signature in Personal settings first.');
  }

  const result = verifySignature(profileRow.profile as SignatureProfile, features);
  if (!result.ok) {
    throw new Error("Signature didn't match your enrolled signature.");
  }

  return { score: result.score, threshold: result.threshold };
}

// The "team label" snapshot stored on an agreement: the signer's first active
// lead team name, or the club-wide leadership label when they lead no team.
export async function resolveCardAgreementTeamLabel(userId: string): Promise<string> {
  const leadTeamIds = await getLeadTeamIds(userId);
  if (leadTeamIds.length === 0) {
    return CREDIT_CARD_DEFAULT_TEAM_LABEL;
  }

  const admin = createAdminClient();
  const { data } = await admin.from('teams').select('id, name').in('id', leadTeamIds);
  const teams = (data || []) as Array<{ id: string; name: string }>;
  // Preserve the lead-membership order so "first active lead team" is stable.
  for (const teamId of leadTeamIds) {
    const match = teams.find((team) => team.id === teamId);
    if (match?.name) return match.name;
  }
  return CREDIT_CARD_DEFAULT_TEAM_LABEL;
}

// --- Phase 3: the gated secure card VIEW -----------------------------------
// The card is only ever viewable inside North America, and inside North America
// only from California by default — any other region needs a Financial Officer
// to approve that location first. On top of that, a viewer must re-sign their
// agreement monthly (Pacific calendar month) and again whenever they appear from
// a new region. evaluateCardViewGate is the single source of truth for all of
// this and is re-checked on every reveal/sign so a stale page can never bypass
// it.

// The only countries from which the card may ever be viewed.
const NA_COUNTRIES = ['US', 'CA', 'MX'];

export type CardViewGate =
  // The grant/agreement gate from Phase 2 isn't satisfied (no slider, or not
  // approved/overridden). The page already handles these states itself.
  | { state: 'no_access' }
  // Outside North America (or we can't confirm the country). Never viewable.
  | { state: 'blocked_na' }
  // Inside North America but from a non-California region that a Financial
  // Officer hasn't approved yet. justRequested marks the first time we inserted
  // the pending row (so the page can notify the FOs once).
  | {
      state: 'blocked_region';
      regionKey: string;
      country: string;
      region: string | null;
      justRequested?: boolean;
    }
  // Region is OK but the viewer must (re-)sign before the card is shown — either
  // a new Pacific month, a new region since last view, or they've never signed.
  | { state: 'require_sign'; regionKey: string; country: string; firstView: boolean }
  // Fully cleared — render the interactive secure card view.
  | { state: 'ok'; regionKey: string; country: string; firstView: boolean };

type CardViewStateRow = {
  user_id: string;
  last_signed_at: string | null;
  last_region: string | null;
  last_country: string | null;
  first_viewed_at: string | null;
};

// The coarse geo the gate keys off, resolved from request headers. Kept pure and
// exported so the country/region/regionKey/California logic is unit-testable.
export type CardGeo = {
  country: string | null;
  region: string | null;
  rawRegion: string | null;
  regionKey: string;
  inCalifornia: boolean;
  inNorthAmerica: boolean;
};

export function resolveCardGeo(headers: Headers): CardGeo {
  const geo = extractSubmissionFootprint(headers).geo;
  const country = geo.country ? geo.country.toUpperCase() : null;
  const region = geo.region ? geo.region.toUpperCase() : null;
  return {
    country,
    region,
    rawRegion: geo.region,
    regionKey: `${country}-${region}`,
    inCalifornia: country === 'US' && region === 'CA',
    // Unknown country is deliberately NOT North America — we can't confirm it.
    inNorthAmerica: country !== null && NA_COUNTRIES.includes(country)
  };
}

// Whether a viewer must (re-)sign before the card is shown: they've never
// signed, the last signature was in a different Pacific month (monthly re-sign),
// or they're viewing from a different region than last time. Pure for testing.
export function cardViewNeedsSign(
  state: { last_signed_at: string | null; last_region: string | null } | null,
  regionKey: string,
  nowIso: string
): boolean {
  if (!state?.last_signed_at) return true;
  if (pacificYearMonth(state.last_signed_at) !== pacificYearMonth(nowIso)) return true;
  return state.last_region !== regionKey;
}

async function getCardViewState(userId: string): Promise<CardViewStateRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card_view_state')
    .select('user_id, last_signed_at, last_region, last_country, first_viewed_at')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as CardViewStateRow | null) ?? null;
}

// The central view-time gate. Resolves the viewer's coarse geo from the request
// headers (Vercel edge geo, reused from the reimbursement footprint extractor),
// then applies the access → North America → region → re-sign rules in order.
export async function evaluateCardViewGate(userId: string, headers: Headers): Promise<CardViewGate> {
  const { country, rawRegion, regionKey, inCalifornia, inNorthAmerica } = resolveCardGeo(headers);

  // 1. Phase-2 gate: admin slider on AND agreement approved/overridden.
  if (!(await canAccessCard(userId))) {
    return { state: 'no_access' };
  }

  // 2 + 3. Unknown country → be SAFE and treat as outside North America (we
  //    can't confirm it); and anywhere actually outside North America → never
  //    viewable. resolveCardGeo folds both into inNorthAmerica.
  if (!country || !inNorthAmerica) {
    return { state: 'blocked_na' };
  }

  // 4. Inside North America but not California → needs an FO-approved location.
  if (!inCalifornia) {
    const admin = createAdminClient();
    const { data: approval } = await admin
      .from('credit_card_region_approvals')
      .select('status')
      .eq('user_id', userId)
      .eq('region_key', regionKey)
      .maybeSingle();

    if (!approval) {
      // First time from this region → record a pending request for an FO.
      await admin
        .from('credit_card_region_approvals')
        .insert({ user_id: userId, region_key: regionKey, country, region: rawRegion });
      return { state: 'blocked_region', regionKey, country, region: rawRegion, justRequested: true };
    }

    if (approval.status === 'pending') {
      return { state: 'blocked_region', regionKey, country, region: rawRegion };
    }
    // status === 'approved' → fall through to the re-sign check.
  }

  // 5. Region is OK (California or an approved location). Decide whether the
  //    viewer must (re-)sign before the card is shown.
  const viewState = await getCardViewState(userId);
  const needsSign = cardViewNeedsSign(viewState, regionKey, new Date().toISOString());
  const firstView = !viewState?.first_viewed_at;

  if (needsSign) {
    return { state: 'require_sign', regionKey, country, firstView };
  }

  return { state: 'ok', regionKey, country, firstView };
}

// Records a successful monthly / new-location verification: stamps last_signed_at
// = now and the region/country the viewer signed from, and sets first_viewed_at
// the first time. Never stores any card data.
export async function recordCardViewSignature(
  userId: string,
  regionKey: string,
  country: string
): Promise<void> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const existing = await getCardViewState(userId);
  const { error } = await admin.from('credit_card_view_state').upsert(
    {
      user_id: userId,
      last_signed_at: now,
      last_region: regionKey,
      last_country: country,
      first_viewed_at: existing?.first_viewed_at ?? now,
      updated_at: now
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    throw new Error(error.message);
  }
}

// Marks that the viewer has opened the card at least once, so the one-time
// first-view reminder doesn't show again. No-op if already set.
export async function markCardFirstViewed(userId: string): Promise<void> {
  const admin = createAdminClient();
  const existing = await getCardViewState(userId);
  if (existing?.first_viewed_at) {
    return;
  }
  const now = new Date().toISOString();
  const { error } = await admin.from('credit_card_view_state').upsert(
    {
      user_id: userId,
      first_viewed_at: now,
      updated_at: now
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    throw new Error(error.message);
  }
}

export type PendingRegionApproval = {
  userId: string;
  regionKey: string;
  country: string | null;
  region: string | null;
  fullName: string | null;
  requestedAt: string;
};

// Location-approval requests awaiting a Financial Officer, newest first, with
// the requesting user's name resolved from profiles.
export async function getPendingRegionApprovals(): Promise<PendingRegionApproval[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('credit_card_region_approvals')
    .select('user_id, region_key, country, region, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  const rows = (data || []) as Array<{
    user_id: string;
    region_key: string;
    country: string | null;
    region: string | null;
    requested_at: string;
  }>;
  if (rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
  const { data: profilesData } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  const nameById = new Map(
    ((profilesData || []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [
      p.id,
      p.full_name || p.email
    ])
  );

  return rows.map((row) => ({
    userId: row.user_id,
    regionKey: row.region_key,
    country: row.country,
    region: row.region,
    fullName: nameById.get(row.user_id) ?? null,
    requestedAt: row.requested_at
  }));
}

// Lowercased emails of every active Financial Officer AND admin — the people who
// approve card access, location requests, and who should hear about a suspected
// screenshot. Mirrors the approver set used by the Phase-2 agreement actions.
export async function getCreditCardApproverEmails(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('profiles')
    .select('email')
    .eq('active', true)
    .or('role.eq.admin,role.eq.financial_officer,is_admin.eq.true,is_financial_officer.eq.true');
  return Array.from(
    new Set(
      ((data || []) as Array<{ email: string | null }>)
        .map((row) => (row.email || '').toLowerCase())
        .filter(Boolean)
    )
  );
}

// A Financial Officer approves a specific viewer's specific location. Idempotent
// on the (user_id, region_key) row; flips it from pending to approved.
export async function approveCardRegion(
  userId: string,
  regionKey: string,
  approverId: string
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('credit_card_region_approvals')
    .update({
      status: 'approved',
      approved_by: approverId,
      approved_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('region_key', regionKey);
  if (error) {
    throw new Error(error.message);
  }
}

export type CardAccessRow = {
  userId: string;
  fullName: string;
  agreementSigned: boolean;
  agreementSignedAt: string | null;
  foApproved: boolean;
  foSignedAt: string | null;
  overridden: boolean;
  overriddenAt: string | null;
  lastAccessAt: string | null;
};

// Overview of everyone whose access slider is on: whether they signed the
// agreement, whether the FO signed it (or an admin overrode), and when they last
// accessed the card. Used by the admin/president settings view and the FO
// approvals page. Reads no card data.
export async function getCardAccessOverview(): Promise<CardAccessRow[]> {
  const admin = createAdminClient();
  const { data: grants } = await admin
    .from('credit_card_grants')
    .select('user_id')
    .eq('enabled', true);
  const userIds = Array.from(new Set((grants || []).map((g) => g.user_id)));
  if (userIds.length === 0) {
    return [];
  }

  const [{ data: profiles }, { data: agreements }, { data: accessEvents }] = await Promise.all([
    admin.from('profiles').select('id, full_name').in('id', userIds),
    admin
      .from('credit_card_agreements')
      .select('user_id, user_signed_at, status, fo_signed_at, override_at')
      .in('user_id', userIds),
    admin
      .from('audit_log_entries')
      .select('actor_id, created_at')
      .in('actor_id', userIds)
      .in('action', ['credit_card.revealed', 'credit_card.view_signed'])
      .order('created_at', { ascending: false })
      .limit(2000)
  ]);

  const nameMap = new Map((profiles || []).map((p) => [p.id, p.full_name as string | null]));
  const agreementMap = new Map((agreements || []).map((a) => [a.user_id, a]));
  // The query is newest-first, so the first time we see an actor is their latest.
  const lastAccess = new Map<string, string>();
  for (const event of accessEvents || []) {
    if (event.actor_id && !lastAccess.has(event.actor_id)) {
      lastAccess.set(event.actor_id, event.created_at as string);
    }
  }

  return userIds
    .map((id) => {
      const agreement = agreementMap.get(id);
      return {
        userId: id,
        fullName: nameMap.get(id) || 'Unknown user',
        agreementSigned: Boolean(agreement),
        agreementSignedAt: agreement?.user_signed_at ?? null,
        foApproved: agreement?.status === 'approved',
        foSignedAt: agreement?.fo_signed_at ?? null,
        overridden: agreement?.status === 'overridden',
        overriddenAt: agreement?.override_at ?? null,
        lastAccessAt: lastAccess.get(id) ?? null
      } satisfies CardAccessRow;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}
