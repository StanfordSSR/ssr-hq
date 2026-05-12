import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTrainingSession } from '@/lib/training-auth';
import { getModule } from '@/lib/training-content';
import { getCompletion, getMemberDisplayName } from '@/lib/training-modules';
import { CertificatePrintButton } from '@/app/training/modules/[slug]/certificate/print-button';

export default async function CertificatePage({
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
  if (!completion) {
    redirect(`/training/modules/${slug}`);
  }

  const displayName = (await getMemberDisplayName(session.email)) || session.email;
  const completedAt = new Date(completion.completedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="cert-page">
      <div className="cert-actions cert-no-print">
        <Link href="/training/home" className="text-link">
          ← Back to training home
        </Link>
        <CertificatePrintButton />
      </div>

      <article className="cert">
        <div className="cert-border">
          <div className="cert-inner">
            <p className="cert-eyebrow">Stanford Student Robotics</p>
            <h1 className="cert-title">Certificate of Completion</h1>
            <p className="cert-line">This certifies that</p>
            <p className="cert-name">{displayName}</p>
            <p className="cert-line">has successfully completed the training module</p>
            <p className="cert-module">{mod.title}</p>
            <div className="cert-meta">
              <div>
                <p className="cert-meta-label">Date completed</p>
                <p className="cert-meta-value">{completedAt}</p>
              </div>
              <div>
                <p className="cert-meta-label">Member email</p>
                <p className="cert-meta-value">{session.email}</p>
              </div>
              <div>
                <p className="cert-meta-label">Module</p>
                <p className="cert-meta-value">{mod.slug}</p>
              </div>
            </div>
            <div className="cert-signature">
              <div className="cert-signature-line" />
              <p className="cert-signature-name">Stanford Student Robotics — Executive Board</p>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
