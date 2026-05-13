import { NextResponse } from 'next/server';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule } from '@/lib/training-content';
import { recordOptIn } from '@/lib/training-modules';

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const session = await getTrainingSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { slug } = await params;
  const mod = getModule(slug);
  if (!mod) {
    return NextResponse.json({ error: 'Module not found' }, { status: 404 });
  }

  if (!mod.gatedByOptIn) {
    return NextResponse.json({ error: 'This module is not opt-in.' }, { status: 400 });
  }

  await recordOptIn(session.email, slug);
  return NextResponse.json({ ok: true });
}
