import { CREDIT_CARD_PAUSED_MESSAGE } from '@/lib/credit-card-status';

export function CreditCardPaused() {
  return (
    <div className="hq-page th-page">
      <div className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Finances</p>
          <h1 className="hq-page-title">Shared club credit card</h1>
        </div>
      </div>
      <section className="hq-panel hq-surface-muted">
        <p className="empty-note">{CREDIT_CARD_PAUSED_MESSAGE}</p>
        <p className="helper">Existing card information and access records are preserved.</p>
      </section>
    </div>
  );
}
