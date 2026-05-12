import { notFound, redirect } from 'next/navigation';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule } from '@/lib/training-content';
import { getCompletion } from '@/lib/training-modules';
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

  const completion = await getCompletion(session.email, slug);

  return (
    <ModulePlayer module={mod} alreadyCompleted={Boolean(completion)} email={session.email} />
  );
}
