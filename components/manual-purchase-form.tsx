'use client';

import { useRef, useState } from 'react';
import { logPurchaseAction } from '@/app/dashboard/actions';

type TeamOption = {
  id: string;
  name: string;
};

type ManualPurchaseFormProps = {
  academicYear: string;
  teams: TeamOption[];
  defaultPersonName: string;
};

const missingReceiptWarning =
  'Not submitting a receipt within 2 weeks of purchase may result in a 6 month suspension of credit card privileges. Do you want to continue without uploading one right now?';

export function ManualPurchaseForm({ academicYear, teams, defaultPersonName }: ManualPurchaseFormProps) {
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'reimbursement' | 'amazon' | 'unknown'>('credit_card');
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <form
      action={logPurchaseAction}
      className="form-stack"
      onSubmit={(event) => {
        if (paymentMethod !== 'credit_card') {
          return;
        }

        const hasReceipt = Boolean(receiptInputRef.current?.files?.length);
        if (!hasReceipt && !window.confirm(missingReceiptWarning)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="academic_year" value={academicYear} />
      <div className="field">
        <label className="label" htmlFor="purchase-team">
          Team
        </label>
        <select className="select" id="purchase-team" name="team_id" defaultValue={teams[0]?.id || ''} required>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      <div className="hq-inline-grid">
        <div className="field">
          <label className="label" htmlFor="purchase-amount">
            Amount
          </label>
          <input className="input" id="purchase-amount" name="amount" type="number" min="0.5" step="0.01" required />
        </div>

        <div className="field">
          <label className="label" htmlFor="purchase-date">
            Date
          </label>
          <input className="input" id="purchase-date" name="purchased_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="purchase-description">
          Item name
        </label>
        <input className="input" id="purchase-description" name="description" placeholder="Motor controller, pizza, Zipcar, lab materials..." required />
      </div>

      <div className="hq-inline-grid">
        <div className="field">
          <label className="label" htmlFor="purchase-person">
            Person
          </label>
          <input className="input" id="purchase-person" name="person_name" defaultValue={defaultPersonName} placeholder="Who paid?" />
        </div>

        <div className="field">
          <label className="label" htmlFor="purchase-method">
            Payment method
          </label>
          <select
            className="select"
            id="purchase-method"
            name="payment_method"
            value={paymentMethod}
            onChange={(event) =>
              setPaymentMethod(event.target.value as 'credit_card' | 'reimbursement' | 'amazon' | 'unknown')
            }
          >
            <option value="credit_card">Credit card</option>
            <option value="amazon">Amazon</option>
            <option value="reimbursement">Reimbursement</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="purchase-category">
          Category
        </label>
        <select className="select" id="purchase-category" name="category" defaultValue="equipment">
          <option value="equipment">Equipment</option>
          <option value="food">Food</option>
          <option value="travel">Travel</option>
        </select>
      </div>

      {paymentMethod === 'credit_card' ? (
        <div className="field">
          <label className="label" htmlFor="purchase-receipt">
            Upload receipt
          </label>
          <input
            ref={receiptInputRef}
            className="input"
            id="purchase-receipt"
            name="receipt"
            type="file"
            accept=".pdf,image/png,image/jpeg,image/webp"
          />
          <span className="helper">
            Receipt uploads must be under 2 MB. If you submit without one, you&apos;ll be warned before the purchase is logged.
          </span>
        </div>
      ) : null}

      <div className="button-row">
        <button className="button" type="submit">
          Save purchase
        </button>
      </div>
    </form>
  );
}
