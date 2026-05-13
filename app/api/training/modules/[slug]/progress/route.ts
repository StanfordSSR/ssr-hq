import { NextResponse } from 'next/server';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule } from '@/lib/training-content';
import { setCurrentChapter } from '@/lib/training-modules';

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

  let payload: { chapterIndex?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const chapterIndex = Number(payload.chapterIndex);
  if (!Number.isFinite(chapterIndex) || chapterIndex < 0 || chapterIndex >= mod.chapters.length) {
    return NextResponse.json({ error: 'Invalid chapterIndex' }, { status: 400 });
  }

  await setCurrentChapter(session.email, slug, chapterIndex);
  return NextResponse.json({ ok: true });
}
