import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext, profileHasFinancialOfficerRole } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getCardAgreement } from '@/lib/credit-card';
import { CreditCardAgreementBody } from '@/components/credit-card-agreement-body';
import {
  CreditCardApprovePanel,
  CreditCardOverrideButton
} from '@/components/credit-card-approval-actions';

export const dynamic = 'force-dynamic';

export default async function CreditCardApprovePage({
  params
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { profile, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isFinancialOfficer =
    currentRole === 'financial_officer' || profileHasFinancialOfficerRole(profile);

  if (!isAdmin && !isFinancialOfficer) {
    redirect('/dashboard');
  }

  const agreement = await getCardAgreement(userId);

  const admin = createAdminClient();
  const { data: requester } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();
  const requesterName = requester?.full_name || requester?.email || 'Unknown';

  const head = (
    <div className="hq-page-head">
      <div className="hq-page-head-copy">
        <p className="hq-eyebrow">Finances</p>
        <h1 className="hq-page-title">Credit card access request</h1>
      </div>
      <div className="hq-page-head-action">
        <Link href="/dashboard/credit-card/approvals" className="hq-inline-link">
          ← Back to requests
        </Link>
      </div>
    </div>
  );

  // No agreement on file at all.
  if (!agreement) {
    return (
      <div className="hq-page">
        {head}
        <section className="hq-panel hq-surface-muted">
          <p className="empty-note">This person has not signed the credit card agreement.</p>
        </section>
      </div>
    );
  }

  // Already decided — show the current status instead of the approve controls.
  if (agreement.status !== 'pending_fo') {
    return (
      <div className="hq-page">
        {head}
        <section className="hq-panel hq-surface-muted">
          <p className="helper" style={{ color: '#1f7a4d', fontWeight: 700 }}>
            {agreement.status === 'approved'
              ? `Already approved — ${requesterName} has access.`
              : `Access already granted by override — ${requesterName} has access.`}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="hq-page">
      {head}

      <section className="hq-panel hq-surface-muted">
        <div
          style={{
            border: '1px solid #e0d4d4',
            background: '#faf7f7',
            borderRadius: 10,
            padding: '0.9rem 1rem',
            marginBottom: '1.25rem'
          }}
        >
          <p style={{ margin: '0 0 0.35rem' }}>
            <strong>Authorized user:</strong> {requesterName}
          </p>
          <p style={{ margin: '0 0 0.35rem' }}>
            <strong>Team:</strong> {agreement.user_team_name || '—'}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Signed:</strong> {formatDateLabel(new Date(agreement.user_signed_at))}
          </p>
        </div>

        {agreement.user_signature ? (
          <div className="field" style={{ marginBottom: '1.25rem' }}>
            <span className="label">Their signature</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agreement.user_signature}
              alt={`${requesterName}'s signature`}
              style={{
                display: 'block',
                maxWidth: 360,
                width: '100%',
                border: '1px solid #e0d4d4',
                borderRadius: 8,
                background: '#ffffff'
              }}
            />
          </div>
        ) : null}

        <CreditCardAgreementBody />
      </section>

      {isFinancialOfficer ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h2>Approve access</h2>
          </div>
          <CreditCardApprovePanel userId={userId} />
        </section>
      ) : null}

      {isAdmin ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h2>Admin override</h2>
          </div>
          <p className="helper">
            Grant access immediately without waiting for a Financial Officer signature.
          </p>
          <CreditCardOverrideButton userId={userId} />
        </section>
      ) : null}
    </div>
  );
}
