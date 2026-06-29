import Link from 'next/link';
import { headers } from 'next/headers';
import { getViewerContext } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import {
  evaluateCardViewGate,
  getCardAgreement,
  getCreditCardApproverEmails,
  getDecryptedCard,
  isCardGrantEnabled,
  issueCardReadToken,
  resolveCardAgreementTeamLabel
} from '@/lib/credit-card';
import { env } from '@/lib/env';
import {
  sendSlackbotNotification,
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME
} from '@/lib/slackbot';
import { CreditCardAgreementBody } from '@/components/credit-card-agreement-body';
import { CreditCardAgreementForm } from '@/components/credit-card-agreement-form';
import { SecureCreditCard } from '@/components/secure-credit-card';
import { SignCardViewForm } from '@/components/sign-card-view-form';

export const dynamic = 'force-dynamic';

export default async function CreditCardPage() {
  const { user, profile: me, currentRole } = await getViewerContext();
  const canGovernCard = currentRole === 'admin' || currentRole === 'financial_officer';

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

          <CreditCardAgreementForm readToken={issueCardReadToken()} />
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

  // Approved or overridden → run the Phase 3 view-time gate (North America →
  // region approval → monthly / new-location re-sign) and branch on the result.
  const gate = await evaluateCardViewGate(user.id, await headers());

  const pageHead = (
    <div className="hq-page-head">
      <div className="hq-page-head-copy">
        <p className="hq-eyebrow">Finances</p>
        <h1 className="hq-page-title">Shared club credit card</h1>
      </div>
      {canGovernCard ? (
        <div className="hq-page-head-action">
          <Link href="/dashboard/credit-card/approvals" className="button-secondary">
            Access &amp; approvals
          </Link>
        </div>
      ) : null}
    </div>
  );

  // Outside North America (or country unknown) → never show the card.
  if (gate.state === 'blocked_na') {
    return (
      <div className="hq-page">
        {pageHead}
        <section
          className="hq-panel"
          style={{ border: '1px solid #e0b4b4', background: '#fbeeee' }}
        >
          <p className="helper" style={{ color: '#8c1515', fontWeight: 700, margin: 0 }}>
            For security, the card can only be viewed inside North America. You appear to be outside
            North America.
          </p>
        </section>
      </div>
    );
  }

  // New (non-California) region awaiting Financial Officer approval. The gate
  // already recorded the pending request; on the very first time, notify the
  // FOs / admins here (best-effort, never blocks the render).
  if (gate.state === 'blocked_region') {
    if (gate.justRequested) {
      try {
        const emails = await getCreditCardApproverEmails();
        if (emails.length > 0) {
          await sendSlackbotNotification({
            idempotency_key: `credit_card_region_request:${user.id}:${gate.regionKey}`,
            type: 'manual_message',
            team_id: SLACKBOT_SYSTEM_TEAM_ID,
            team_name: SLACKBOT_SYSTEM_TEAM_NAME,
            recipient_emails: emails,
            title: 'Credit card location approval needed',
            message: `${me.full_name || 'A credit card user'} is trying to view the card from a new location (${gate.region || gate.regionKey}) and needs approval.`,
            cta_label: 'Review location',
            cta_url: `${env.siteUrl}/dashboard/credit-card/approvals`,
            metadata: { user_id: user.id, region_key: gate.regionKey }
          });
        }
      } catch (error) {
        console.error('Credit card region request Slack push failed:', error);
      }
    }

    return (
      <div className="hq-page">
        {pageHead}
        <section
          className="hq-panel"
          style={{ border: '1px solid #e0c08a', background: '#fdf6e8' }}
        >
          <p className="helper" style={{ color: '#8a5a00', fontWeight: 700, margin: 0 }}>
            You&apos;re viewing from a new region ({gate.region || gate.regionKey}). A Financial Officer
            must approve card access from this location. They&apos;ve been notified.
          </p>
        </section>
      </div>
    );
  }

  // We need the card metadata (counts only — never the digits) for the on-page
  // card. If no card is on file, say so.
  const card = await getDecryptedCard();
  if (!card) {
    return (
      <div className="hq-page">
        {pageHead}
        <section className="hq-panel hq-surface-muted">
          <p className="empty-note">No card is on file yet. Ask an admin to add one in Club Settings.</p>
        </section>
      </div>
    );
  }

  const numberGroups = Math.ceil(card.number.replace(/\D/g, '').length / 4);
  const cvvLength = card.cvv.replace(/\D/g, '').length;

  // Monthly / new-location re-verification needed → show a masked front-only
  // card plus the sign-to-view form.
  if (gate.state === 'require_sign') {
    return (
      <div className="hq-page">
        {pageHead}
        <section className="hq-panel hq-surface-muted">
          <p className="helper" style={{ fontWeight: 600 }}>
            Monthly verification / new-location verification — sign to view the card.
          </p>
          <div
            aria-label="Shared club credit card (locked)"
            style={{
              width: '100%',
              maxWidth: 420,
              aspectRatio: '1.586 / 1',
              borderRadius: 18,
              margin: '1rem 0',
              padding: '1.25rem 1.4rem',
              boxSizing: 'border-box',
              color: '#f4f7fb',
              background:
                'linear-gradient(135deg, #16233b 0%, #1f3a5f 38%, #25425f 60%, #11151c 100%)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 46,
                  height: 34,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #e9c46a 0%, #d4a93f 50%, #b8860b 100%)',
                  boxShadow: 'inset 0 0 4px rgba(0,0,0,0.35)'
                }}
              />
              <div style={{ textAlign: 'right', fontSize: '0.62rem', letterSpacing: '0.1em', fontWeight: 700, color: '#cfe0f2' }}>
                STANFORD STUDENT
                <br />
                ENTERPRISES
              </div>
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: 'clamp(1.05rem, 4.4vw, 1.5rem)',
                letterSpacing: '0.12em'
              }}
            >
              •••• •••• •••• ••••
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '0.58rem', letterSpacing: '0.14em', color: '#aebfd4' }}>CARD HOLDER</div>
                <div style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {card.cardholder}
                </div>
                <div
                  aria-hidden="true"
                  style={{ marginTop: '0.35rem', fontStyle: 'italic', fontWeight: 800, fontSize: '1.2rem' }}
                >
                  VISA
                </div>
              </div>
            </div>
          </div>
          <SignCardViewForm />
        </section>
      </div>
    );
  }

  // Fully cleared → the interactive secure card view. Only counts + the viewer's
  // own identity are passed; the real digits are fetched on demand.
  if (gate.state === 'ok') {
    return (
      <div className="hq-page">
        {pageHead}
        <section className="hq-panel hq-surface-muted">
          <p className="helper" style={{ color: '#1f7a4d', fontWeight: 700, marginTop: 0 }}>
            Access granted.
          </p>
          <SecureCreditCard
            cardholder={card.cardholder}
            numberGroups={numberGroups}
            cvvLength={cvvLength}
            viewerName={me.full_name || 'You'}
            viewerEmail={user.email || me.email || ''}
            firstView={gate.firstView}
          />
        </section>
      </div>
    );
  }

  // Defensive fallback: the gate lost access between the Phase-2 check above and
  // here (shouldn't normally happen since we're already approved/overridden).
  return (
    <div className="hq-page">
      {pageHead}
      <section className="hq-panel hq-surface-muted">
        <p className="empty-note">You don&apos;t currently have access to view the card.</p>
      </section>
    </div>
  );
}
