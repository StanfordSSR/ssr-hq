import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TRAINING_SESSION_COOKIE, revokeTrainingSessionByToken } from '@/lib/training-auth';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRAINING_SESSION_COOKIE)?.value;
  if (token) {
    await revokeTrainingSessionByToken(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(TRAINING_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0
  });
  return response;
}
