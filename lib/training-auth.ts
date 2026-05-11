import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase-admin';

export const TRAINING_SESSION_COOKIE = 'training_session';
const SESSION_TTL_DAYS = 30;
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

export type TrainingSession = {
  id: string;
  email: string;
  expiresAt: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export async function isEmailEligible(email: string): Promise<boolean> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const { data: rosterRows, error: rosterError } = await supabase
    .from('team_roster_members')
    .select('id')
    .ilike('stanford_email', normalized)
    .limit(1);

  if (rosterError) {
    throw new Error(`Failed to check roster: ${rosterError.message}`);
  }

  if (rosterRows && rosterRows.length > 0) {
    return true;
  }

  // HQ portal users (admins, presidents, financial officers, team leads) are
  // also club members for training purposes.
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .eq('active', true)
    .limit(1);

  if (profileError) {
    throw new Error(`Failed to check profiles: ${profileError.message}`);
  }

  return Boolean(profileRows && profileRows.length > 0);
}

export async function issueOtpCode(email: string, requestIp: string | null) {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  // Invalidate any prior unconsumed codes for this email so only the freshest is valid.
  await supabase
    .from('training_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .ilike('email', normalized)
    .is('consumed_at', null);

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();
  const { error } = await supabase.from('training_otp_codes').insert({
    email: normalized,
    code_hash: hashCode(code),
    expires_at: expiresAt,
    request_ip: requestIp
  });

  if (error) {
    throw new Error(`Failed to issue OTP: ${error.message}`);
  }

  return { code, expiresAt };
}

export type VerifyResult =
  | { ok: true; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' };

export async function verifyOtpAndCreateSession(
  email: string,
  code: string,
  userAgent: string | null
): Promise<VerifyResult> {
  const supabase = createAdminClient();
  const normalized = normalizeEmail(email);

  const { data: rows, error } = await supabase
    .from('training_otp_codes')
    .select('*')
    .ilike('email', normalized)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to look up OTP: ${error.message}`);
  }

  const row = rows?.[0];
  if (!row) {
    return { ok: false, reason: 'invalid' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase
      .from('training_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id);
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_OTP_ATTEMPTS) {
    await supabase
      .from('training_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id);
    return { ok: false, reason: 'too_many_attempts' };
  }

  const matches = safeEqualHex(hashCode(code), row.code_hash);

  if (!matches) {
    await supabase
      .from('training_otp_codes')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id);
    return { ok: false, reason: 'invalid' };
  }

  await supabase
    .from('training_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id);

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const { error: insertError } = await supabase.from('training_sessions').insert({
    token_hash: hashSessionToken(token),
    email: normalized,
    user_agent: userAgent,
    expires_at: expiresAt.toISOString()
  });

  if (insertError) {
    throw new Error(`Failed to create session: ${insertError.message}`);
  }

  return { ok: true, sessionToken: token, expiresAt };
}

export async function getTrainingSession(): Promise<TrainingSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRAINING_SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('training_sessions')
    .select('id, email, expires_at, revoked_at')
    .eq('token_hash', hashSessionToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;

  return { id: data.id, email: data.email, expiresAt: data.expires_at };
}

export async function revokeTrainingSessionByToken(token: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('training_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashSessionToken(token));
}

export const TRAINING_SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
export const TRAINING_OTP_TTL_MINUTES = OTP_TTL_MINUTES;
