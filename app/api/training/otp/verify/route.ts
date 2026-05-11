import { NextResponse } from 'next/server';
import {
  TRAINING_SESSION_COOKIE,
  TRAINING_SESSION_TTL_SECONDS,
  normalizeEmail,
  verifyOtpAndCreateSession
} from '@/lib/training-auth';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const rawEmail = (payload as { email?: unknown })?.email;
  const rawCode = (payload as { code?: unknown })?.code;

  if (typeof rawEmail !== 'string' || typeof rawCode !== 'string') {
    return NextResponse.json({ error: 'Missing email or code.' }, { status: 400 });
  }

  const cleanCode = rawCode.replace(/\D/g, '');
  if (cleanCode.length !== 6) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 });
  }

  const result = await verifyOtpAndCreateSession(
    normalizeEmail(rawEmail),
    cleanCode,
    request.headers.get('user-agent')
  );

  if (!result.ok) {
    const message =
      result.reason === 'expired'
        ? 'That code has expired. Request a new one.'
        : result.reason === 'too_many_attempts'
          ? 'Too many attempts. Request a new code.'
          : 'That code is not valid.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(TRAINING_SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: TRAINING_SESSION_TTL_SECONDS
  });
  return response;
}
