import Link from 'next/link';
import { Header } from '@/components/header';
import { createAdminClient } from '@/lib/supabase-admin';
import { getReimbursementByToken } from '@/lib/reimbursements';
import { ApprovalPanel } from '@/app/approve-reimbursement/[token]/approval-panel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Review reimbursement — Stanford Student Robotics'
};

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function ApproveReimbursementPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reimbursement = await getReimbursementByToken(token);

  if (!reimbursement) {
    return (
      <>
        <Header />
        <main className="page-shell">
          <section className="auth-shell">
            <div className="auth-card">
              <h1 className="auth-title">Link not found</h1>
              <p className="helper">This approval link isn&apos;t valid or has expired.</p>
              <Link className="text-link" href="/">
                Back to home
              </Link>
            </div>
          </section>
        </main>
      </>
    );
  }

  const admin = createAdminClient();
  const { data: team } = await admin
    .from('teams')
    .select('name')
    .eq('id', reimbursement.team_id)
    .maybeSingle();

  const details = (
    <dl className="form-stack" style={{ margin: 0 }}>
      <Row label="Team" value={team?.name || '—'} />
      <Row label="Submitted by" value={reimbursement.submitter_name} />
      <Row label="Item" value={reimbursement.item_name} />
      <Row label="Amount" value={formatCurrency(reimbursement.amount_cents)} />
      <Row label="Granted #" value={reimbursement.reimbursement_number} />
    </dl>
  );

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Reimbursement review</p>
            <h1 className="auth-title">
              {reimbursement.status === 'pending' ? 'Approve or reject' : 'Reimbursement'}
            </h1>
            <p className="auth-subtitle">
              {reimbursement.submitter_name} submitted this purchase for {team?.name || 'their team'}.
              {reimbursement.requires_signature
                ? ' Because it is over the approval threshold, you must sign to approve it.'
                : ''}
            </p>
            <Link className="text-link" href="/dashboard/reimbursements">
              Open the reimbursements dashboard
            </Link>
          </div>

          <div className="auth-card">
            {details}
            <div style={{ height: '1rem' }} />
            <ApprovalPanel
              token={token}
              requiresSignature={reimbursement.requires_signature}
              initialStatus={reimbursement.status}
            />
          </div>
        </section>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
      <dt className="helper" style={{ margin: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>{value}</dd>
    </div>
  );
}
