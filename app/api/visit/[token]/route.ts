import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import { sendVisitorBadgeEmail } from '@/lib/notifications';
import { extractSubmissionFootprint } from '@/lib/reimbursements';
import { extractSignatureFeatures, parseStrokes } from '@/lib/signature-verify';
import {
  generateToken,
  getAgreementByContractToken,
  isAgreementExpired,
  type VisitorSignerMeta
} from '@/lib/visitor-agreements';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Compute full years between a YYYY-MM-DD date of birth and now.
function ageInYears(dob: string): number | null {
  const birth = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
}

// Keep only the known client-meta keys, capping string lengths and ignoring
// anything else the client might send. Returns null when nothing usable came
// through so we don't store an empty object.
function sanitizeSignerMeta(raw: unknown): VisitorSignerMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 400) : undefined;
  const num = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const meta: VisitorSignerMeta = {};
  const language = str(input.language);
  const timezone = str(input.timezone);
  const platform = str(input.platform);
  const userAgent = str(input.userAgent);
  const screenW = num(input.screenW);
  const screenH = num(input.screenH);
  if (language !== undefined) meta.language = language;
  if (timezone !== undefined) meta.timezone = timezone;
  if (platform !== undefined) meta.platform = platform;
  if (userAgent !== undefined) meta.userAgent = userAgent;
  if (screenW !== undefined) meta.screenW = screenW;
  if (screenH !== undefined) meta.screenH = screenH;

  return Object.keys(meta).length > 0 ? meta : null;
}

// Public endpoint: an external visitor signs the contract behind a contract
// token. We record their details, signature, IP, and user agent, mint a badge
// token, and (best-effort) email them the badge link.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const agreement = await getAgreementByContractToken(token);
  if (!agreement) {
    return NextResponse.json({ error: 'This access link is not valid.' }, { status: 404 });
  }
  if (isAgreementExpired(agreement.access_end)) {
    return NextResponse.json({ error: 'This access link has expired.' }, { status: 410 });
  }
  if (agreement.status === 'signed') {
    return NextResponse.json(
      { error: 'This agreement has already been completed.' },
      { status: 409 }
    );
  }

  let body: {
    full_name?: unknown;
    university?: unknown;
    dob?: unknown;
    email?: unknown;
    phone?: unknown;
    acknowledgements?: unknown;
    signature?: unknown;
    strokes?: unknown;
    client_meta?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Could not read your submission.' }, { status: 400 });
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const university = typeof body.university === 'string' ? body.university.trim() : '';
  const dob = typeof body.dob === 'string' ? body.dob.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';
  const acknowledgements = Array.isArray(body.acknowledgements) ? body.acknowledgements : [];

  if (!fullName || !university || !dob || !email || !phone) {
    return NextResponse.json({ error: 'Please fill in every field.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if ((phone.match(/\d/g) || []).length < 7) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }
  const age = ageInYears(dob);
  if (age === null) {
    return NextResponse.json({ error: 'Enter a valid date of birth.' }, { status: 400 });
  }
  if (age < 18) {
    return NextResponse.json(
      { error: 'You must be at least 18 years old to sign this agreement.' },
      { status: 422 }
    );
  }
  if (acknowledgements.length !== 7 || !acknowledgements.every((value) => value === true)) {
    return NextResponse.json(
      { error: 'You must acknowledge all seven statements to continue.' },
      { status: 422 }
    );
  }
  if (!signature) {
    return NextResponse.json(
      { error: 'Draw your signature at the end of the agreement.' },
      { status: 400 }
    );
  }

  // Ensure a real signature was actually drawn (not an empty pad or a one-dot
  // scribble) by deriving features from the captured pen path.
  const strokes = parseStrokes(body.strokes);
  if (!extractSignatureFeatures(strokes)) {
    return NextResponse.json(
      { error: 'Please draw your full signature.' },
      { status: 400 }
    );
  }

  const signerGeo = extractSubmissionFootprint(request.headers).geo;
  const signerMeta = sanitizeSignerMeta(body.client_meta);

  const signerIp =
    firstHeaderValue(request.headers.get('x-forwarded-for')) ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-vercel-forwarded-for');
  const signerUserAgent = request.headers.get('user-agent');

  const badgeToken = generateToken();
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('visitor_agreements')
    .update({
      participant_name: fullName,
      participant_university: university,
      participant_dob: dob,
      participant_email: email,
      participant_phone: phone,
      participant_signature: signature,
      acknowledgements,
      signed_at: new Date().toISOString(),
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      participant_signature_strokes: strokes,
      signer_geo: signerGeo,
      signer_meta: signerMeta,
      status: 'signed',
      badge_token: badgeToken
    })
    .eq('id', agreement.id)
    .eq('status', 'pending');

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || 'Could not record your signature. Try again.' },
      { status: 500 }
    );
  }

  await recordAuditEvent({
    actorId: agreement.issued_by,
    action: 'visitor_agreement.signed',
    targetType: 'visitor_agreement',
    targetId: agreement.id,
    summary: `${fullName} (${university}) signed the external visitor access agreement.`,
    details: {
      participantEmail: email,
      accessStart: agreement.access_start,
      accessEnd: agreement.access_end,
      signerIp
    }
  });

  const badgeUrl = `${env.siteUrl}/badge/${badgeToken}`;
  try {
    await sendVisitorBadgeEmail({
      to: email,
      name: fullName,
      badgeUrl,
      accessEnd: agreement.access_end
    });
  } catch (error) {
    // Never fail the signing just because the email couldn't be sent — the page
    // still shows the badge link.
    console.error('Failed to send visitor badge email:', error);
  }

  return NextResponse.json({ ok: true, badgeUrl });
}
