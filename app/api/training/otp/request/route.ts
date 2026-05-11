import { NextResponse } from 'next/server';
import { isEmailInRoster, issueOtpCode, normalizeEmail, TRAINING_OTP_TTL_MINUTES } from '@/lib/training-auth';
import { sendTrainingOtpEmail } from '@/lib/notifications';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawEmail = (payload as { email?: unknown })?.email;
  if (typeof rawEmail !== 'string' || !EMAIL_PATTERN.test(rawEmail)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const email = normalizeEmail(rawEmail);
  const inRoster = await isEmailInRoster(email);

  // Always respond with the same shape so we don't reveal which emails are on the roster.
  if (!inRoster) {
    return NextResponse.json({ ok: true });
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null;

  const { code } = await issueOtpCode(email, ip);

  try {
    await sendTrainingOtpEmail({ to: email, code, expiresInMinutes: TRAINING_OTP_TTL_MINUTES });
  } catch (error) {
    console.error('Failed to send training OTP email', error);
    return NextResponse.json({ error: 'Could not send code. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
