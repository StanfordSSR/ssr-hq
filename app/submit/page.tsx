import Link from 'next/link';
import { Header } from '@/components/header';
import { createAdminClient } from '@/lib/supabase-admin';
import { getReimbursementSettings } from '@/lib/reimbursements';
import { SubmitReimbursementForm } from '@/app/submit/submit-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Submit a reimbursement — Stanford Student Robotics',
  description: 'Log a purchase you paid for so your team lead can approve the reimbursement.'
};

// Public, login-free page. Anyone with the link can submit a reimbursement.
export default async function SubmitPage() {
  const admin = createAdminClient();
  const [{ data: teams }, settings] = await Promise.all([
    admin.from('teams').select('id, name').eq('is_active', true).order('name', { ascending: true }),
    getReimbursementSettings()
  ]);

  const teamOptions = (teams || []).map((t) => ({ id: t.id, name: t.name }));
  const threshold = (settings.signatureThresholdCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  });

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Reimbursements</p>
            <h1 className="auth-title">Log a purchase</h1>
            <p className="auth-subtitle">
              Paid for something with your own money? Submit it here and your team lead will be
              notified to approve the reimbursement. No account needed — just make sure your name is
              on your team&apos;s roster.
            </p>
            <ul className="helper" style={{ lineHeight: 1.7, paddingLeft: '1.1rem' }}>
              <li>Paste a photo of the receipt to auto-fill the details, or type them in.</li>
              <li>
                You&apos;ll need your Stanford Granted reimbursement number (e.g. <strong>R-119704</strong>)
                — file in the Granted portal first to get it.
              </li>
              <li>Purchases over {threshold} require your lead to sign to approve.</li>
            </ul>
            <Link className="text-link" href="/">
              Back to home
            </Link>
          </div>

          <div className="auth-card">
            {settings.intakeEnabled ? (
              <SubmitReimbursementForm teams={teamOptions} />
            ) : (
              <p className="helper">
                Reimbursement submissions are currently closed. Please check with your team lead.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
