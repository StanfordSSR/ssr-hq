import { getViewerContext } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import {
  getCardAgreement,
  isCardGrantEnabled,
  resolveCardAgreementTeamLabel
} from '@/lib/credit-card';
import { CreditCardAgreementBody } from '@/components/credit-card-agreement-body';
import { CreditCardAgreementForm } from '@/components/credit-card-agreement-form';

export default async function CreditCardPage() {
  const { user, profile: me } = await getViewerContext();

  const [grantEnabled, agreement] = await Promise.all([
    isCardGrantEnabled(user.id),
    getCardAgreement(user.id)
  ]);

  // No access at all.
  if (!grantEnabled) {
    return (
      <div className="hq-page">
        <div className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Finances</p>
            <h1 className="hq-page-title">Shared club credit card</h1>
          </div>
        </div>
        <section className="hq-panel hq-surface-muted">
          <p className="empty-note">
            You don&apos;t currently have credit card access. Ask an admin to grant it in Club
            Settings.
          </p>
        </section>
      </div>
    );
  }

  // Granted but not yet signed → show the agreement to sign.
  if (!agreement) {
    const teamLabel = await resolveCardAgreementTeamLabel(user.id);
    const today = formatDateLabel(new Date());

    return (
      <div className="hq-page">
        <div className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Finances</p>
            <h1 className="hq-page-title">Credit card access agreement</h1>
            <p className="hq-subtitle">
              Read and sign the agreement below to request access to the shared club credit card.
            </p>
          </div>
        </div>

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
              <strong>Authorized user:</strong> {me.full_name || 'You'}
            </p>
            <p style={{ margin: '0 0 0.35rem' }}>
              <strong>Team:</strong> {teamLabel}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Date:</strong> {today}
            </p>
          </div>

          <CreditCardAgreementBody />

          <CreditCardAgreementForm />
        </section>
      </div>
    );
  }

  // Signed, waiting on the Financial Officer.
  if (agreement.status === 'pending_fo') {
    return (
      <div className="hq-page">
        <div className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Finances</p>
            <h1 className="hq-page-title">Shared club credit card</h1>
          </div>
        </div>
        <section className="hq-panel hq-surface-muted">
          <p className="helper" style={{ color: '#1f7a4d', fontWeight: 600 }}>
            Signed ✓ — waiting for Financial Officer approval.
          </p>
          <p className="helper">Signed on {formatDateLabel(new Date(agreement.user_signed_at))}.</p>
        </section>
      </div>
    );
  }

  // Approved or overridden → access granted (the card view itself is Phase 3).
  return (
    <div className="hq-page">
      <div className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Finances</p>
          <h1 className="hq-page-title">Shared club credit card</h1>
        </div>
      </div>
      <section className="hq-panel hq-surface-muted">
        <p className="helper" style={{ color: '#1f7a4d', fontWeight: 700 }}>
          Access granted.
        </p>
        <p className="helper">
          The secure card view is being set up — it will appear here in the next update.
        </p>
      </section>
    </div>
  );
}
