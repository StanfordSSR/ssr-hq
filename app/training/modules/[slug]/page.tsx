import { notFound, redirect } from 'next/navigation';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule } from '@/lib/training-content';
import { getCompletion, getCurrentChapter } from '@/lib/training-modules';
import { ModulePlayer } from '@/app/training/modules/[slug]/module-player';

export default async function TrainingModulePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getTrainingSession();
  if (!session) {
    redirect('/training/login');
  }

  const { slug } = await params;
  const mod = getModule(slug);
  if (!mod) {
    notFound();
  }

  const [completion, savedChapter] = await Promise.all([
    getCompletion(session.email, slug),
    getCurrentChapter(session.email, slug)
  ]);

  const alreadyCompleted = Boolean(completion);
  // Re-clamp to a valid index in case the module structure changed.
  const startChapter = alreadyCompleted
    ? 0
    : Math.min(Math.max(0, savedChapter), mod.chapters.length - 1);

  return (
    <ModulePlayer
      module={mod}
      alreadyCompleted={alreadyCompleted}
      email={session.email}
      startChapter={startChapter}
    />
  );
}
