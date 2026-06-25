import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext, holdsSigningRole } from '@/lib/auth';
import { SignatureEnrollment } from '@/components/signature-enrollment';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enroll your signature — Stanford Student Robotics HQ',
  description: 'Signing officers must enroll a signature before using SSR HQ.'
};

// Standalone lockout page (outside /dashboard) shown to signing officers who have
// not yet enrolled a signature. getViewerContext redirects to /login if the user
// is not authenticated. Once enrolled, the guard below sends them to /dashboard.
export default async function EnrollSignaturePage() {
  const { user, profile } = await getViewerContext();

  if (!holdsSigningRole(profile)) {
    redirect('/dashboard');
  }

  const { data: signatureRow } = await createAdminClient()
    .from('signature_profiles')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (signatureRow) {
    redirect('/dashboard');
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Security</p>
            <h1 className="auth-title">Enroll your signature</h1>
            <p className="auth-subtitle">
              Your portal role lets you sign approvals, budgets, and visitor access links. Before you
              can use SSR HQ, you need to enroll a few sample signatures so future approvals you sign
              can be verified against your handwriting.
            </p>
          </div>

          <SignatureEnrollment enrolled={false} sampleCount={0} />
        </section>
      </main>
    </>
  );
}
