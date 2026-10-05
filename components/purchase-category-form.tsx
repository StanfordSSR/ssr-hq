'use client';

import { updatePurchaseCategoryAction } from '@/app/dashboard/actions';
import { BudgetChargeFields } from '@/components/budget-charge-fields';
import type { ChargeAccount } from '@/lib/budget-charge-routing';

type PurchaseCategoryFormProps = {
  purchaseId: string;
  accounts: ChargeAccount[];
  expenseId: string;
  sourceId: string;
};

export function PurchaseCategoryForm({ purchaseId, accounts, expenseId, sourceId }: PurchaseCategoryFormProps) {
  return (
    <form action={updatePurchaseCategoryAction} className="hq-category-form">
      <input type="hidden" name="purchase_id" value={purchaseId} />
      <BudgetChargeFields accounts={accounts} idPrefix={`purchase-${purchaseId}`} initialExpenseId={expenseId} initialSourceId={sourceId} />
      <button className="button-secondary" type="submit">
        Save
      </button>
    </form>
  );
}
