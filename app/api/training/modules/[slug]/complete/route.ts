import { NextResponse } from 'next/server';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule, totalMinSeconds } from '@/lib/training-content';
import { clearModuleStart, getModuleStartedAt, recordCompletion } from '@/lib/training-modules';

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getTrainingSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { slug } = await params;
  const mod = getModule(slug);
  if (!mod) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }

  const startedAt = await getModuleStartedAt(session.email, slug);
  if (!startedAt) {
    return NextResponse.json(
      { error: 'No active start record for this module. Reload and begin from chapter 1.' },
      { status: 400 }
    );
  }

  const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;
  const required = totalMinSeconds(mod);
  if (elapsedSeconds < required) {
    const remaining = Math.ceil(required - elapsedSeconds);
    return NextResponse.json(
      {
        error: `You need to spend more time on the material. About ${remaining} seconds remaining before completion can be recorded.`,
        remainingSeconds: remaining
      },
      { status: 400 }
    );
  }

  let payload: { score?: number; attempts?: number } = {};
  try {
    payload = await request.json();
  } catch {
    // empty body is fine
  }

  const score = typeof payload.score === 'number' ? payload.score : 1.0;
  const attempts = typeof payload.attempts === 'number' && payload.attempts >= 1 ? Math.floor(payload.attempts) : 1;

  await recordCompletion(session.email, slug, score, attempts);
  await clearModuleStart(session.email, slug);

  return NextResponse.json({ ok: true });
}
