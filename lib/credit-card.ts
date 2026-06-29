import { createAdminClient } from '@/lib/supabase-admin';
import { encryptCard, decryptCard } from '@/lib/card-crypto';
import {
  getRoleLabel,
  profileHasFinancialOfficerRole,
  profileHasPresidentRole,
  profileHasVicePresidentRole,
  type Profile
} from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import {
  extractSignatureFeatures,
  parseStrokes,
  verifySignature,
  type SignatureProfile
} from '@/lib/signature-verify';

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
