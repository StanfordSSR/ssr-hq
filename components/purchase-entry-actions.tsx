'use client';

import { useState } from 'react';
import { deletePurchaseAction, updatePurchaseDetailsAction } from '@/app/dashboard/actions';
import type { PurchaseCategory } from '@/lib/purchases';

type PurchaseEntryActionsProps = {
  purchaseId: string;
  description: string;
  amountCents: number;
  purchasedAt: string;
  personName: string | null;
  paymentMethod: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  category: PurchaseCategory;
};

export function PurchaseEntryActions({
  purchaseId,
  description,
  amountCents,
  purchasedAt,
  personName,
  paymentMethod,
  category
}: PurchaseEntryActionsProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="hq-purchase-actions">
      <button className="hq-inline-link" type="button" onClick={() => setOpen((current) => !current)}>
        {open ? 'Close' : 'Edit'}
      </button>

      <form
        action={deletePurchaseAction}
        onSubmit={(event) => {
          if (!window.confirm(`Delete "${description}" from the expense log?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="purchase_id" value={purchaseId} />
        <button className="hq-inline-link hq-inline-link-danger" type="submit">
          Delete
        </button>
      </form>

      {open ? (
        <form action={updatePurchaseDetailsAction} className="hq-purchase-edit-form">
          <input type="hidden" name="purchase_id" value={purchaseId} />

          <div className="hq-purchase-edit-grid">
            <input className="input" name="description" defaultValue={description} required />
            <input
              className="input"
              name="amount"
              type="number"
              min="0.5"
              step="0.01"
              defaultValue={(amountCents / 100).toFixed(2)}
              required
            />
            <input className="input" name="purchased_at" type="date" defaultValue={purchasedAt.slice(0, 10)} required />
            <input className="input" name="person_name" defaultValue={personName || ''} placeholder="Who paid?" />
            <select className="select" name="payment_method" defaultValue={paymentMethod}>
              <option value="credit_card">Credit card</option>
              <option value="amazon">Amazon</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="unknown">Unknown</option>
            </select>
            <select className="select" name="category" defaultValue={category}>
              <option value="equipment">Equipment</option>
              <option value="food">Food</option>
              <option value="gas">Gas</option>
              <option value="car_rental">Car Rental</option>
              <option value="accommodation">Accommodation</option>
              <option value="travel_fares">Travel Fares</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="hq-inline-editor-actions">
            <button className="button-secondary" type="submit">
              Save details
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
