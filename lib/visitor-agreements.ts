import { createAdminClient } from '@/lib/supabase-admin';
import {
  extractSignatureFeatures,
  parseStrokes,
  verifySignature,
  type SignatureProfile,
  type SignatureStroke
} from '@/lib/signature-verify';
import type { SubmissionGeo } from '@/lib/reimbursements';

export type VisitorSignerMeta = {
  language?: string;
  timezone?: string;
  screenW?: number;
  screenH?: number;
  platform?: string;
  userAgent?: string;
};

// External visitor access agreements. A president (or admin) issues an
// unguessable contract link, signs it (verified against their enrolled
// signature), and an external visitor reads + signs the public legal contract.
// On signing they get a badge link valid until the access end date. Rows are
// only ever read/written through the service-role key.

export type VisitorAgreement = {
  id: string;
  contract_token: string;
  badge_token: string | null;
  issued_by: string | null;
  issuer_name: string;
  access_start: string;
  access_end: string;
  issuer_signature: string | null;
  status: 'pending' | 'signed';
  participant_name: string | null;
  participant_university: string | null;
  participant_dob: string | null;
  participant_email: string | null;
  participant_phone: string | null;
  participant_signature: string | null;
  acknowledgements: boolean[] | null;
  signed_at: string | null;
  signer_ip: string | null;
  signer_user_agent: string | null;
  participant_signature_strokes: SignatureStroke[] | null;
  signer_geo: SubmissionGeo | null;
  signer_meta: VisitorSignerMeta | null;
  created_at: string;
  updated_at: string;
};

// Two concatenated UUIDs with dashes removed — a 64-char unguessable token.
export function generateToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
}

// Today's calendar date in Pacific time as a YYYY-MM-DD string. Date-only
// comparisons against this string respect the Pacific calendar day regardless
// of where the server runs.
export function pacificDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export async function getAgreementByContractToken(token: string): Promise<VisitorAgreement | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('visitor_agreements')
    .select('*')
    .eq('contract_token', token)
    .maybeSingle();
  return (data as VisitorAgreement | null) ?? null;
}

export async function getAgreementByBadgeToken(token: string): Promise<VisitorAgreement | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('visitor_agreements')
    .select('*')
    .eq('badge_token', token)
    .maybeSingle();
  return (data as VisitorAgreement | null) ?? null;
}

// True when accessEnd (a YYYY-MM-DD date) is before "today" in Pacific time.
// The access end date itself is still valid (badge works through that day).
export function isAgreementExpired(accessEnd: string): boolean {
  return accessEnd < pacificDateKey();
}

// Verify a president's drawn signature against their enrolled signature profile
// before letting them issue a visitor link. Throws a user-facing error when the
// signer hasn't enrolled, the drawing is too brief, or it doesn't match.
export async function verifyIssuerSignature(
  userId: string,
  rawStrokes: unknown
): Promise<{ ok: boolean; score: number; threshold: number }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from('signature_profiles')
    .select('profile')
    .eq('user_id', userId)
    .maybeSingle();

  if (!row) {
    throw new Error('Enroll your signature in Personal settings before issuing visitor links.');
  }

  const features = extractSignatureFeatures(parseStrokes(rawStrokes));
  if (!features) {
    throw new Error('That signature was too brief — sign again.');
  }

  const result = verifySignature(row.profile as SignatureProfile, features);
  if (!result.ok) {
    throw new Error("Signature didn't match your enrolled signature.");
  }

  return result;
}

// Delete agreements whose access window has fully elapsed (access_end before
// today, Pacific). Called from the daily cron.
export async function purgeExpiredVisitorAgreements(): Promise<{ deleted: number }> {
  const admin = createAdminClient();
  const cutoff = pacificDateKey();
  const { error, count } = await admin
    .from('visitor_agreements')
    .delete({ count: 'exact' })
    .lt('access_end', cutoff);
  if (error) {
    console.error('Failed to purge expired visitor agreements:', error.message);
    return { deleted: 0 };
  }
  return { deleted: count || 0 };
}

// Format a YYYY-MM-DD..YYYY-MM-DD range as e.g. "June 21, 2026 – June 28, 2026".
// The dates are plain calendar dates, so anchor formatting at local noon to
// avoid any timezone shift across the date boundary.
export function formatAgreementDateRange(start: string, end: string): string {
  const fmt = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

// Format a single YYYY-MM-DD date as e.g. "June 28, 2026" (no timezone shift).
export function formatAgreementDate(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}
