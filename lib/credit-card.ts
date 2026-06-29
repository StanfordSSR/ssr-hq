import { createAdminClient } from '@/lib/supabase-admin';
import { encryptCard, decryptCard } from '@/lib/card-crypto';
import {
  getRoleLabel,
  profileHasFinancialOfficerRole,
  profileHasPresidentRole,
  profileHasVicePresidentRole,
  type Profile
} from '@/lib/auth';

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
