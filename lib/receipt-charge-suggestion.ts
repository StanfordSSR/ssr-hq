import type { ExpenseCategory } from '@/lib/budget-plan';
import type { ChargeAccount } from '@/lib/budget-charge-routing';

type ReceiptChargeHint = {
  category: ExpenseCategory | null;
  itemName: string | null;
  merchant: string | null;
};

export function suggestReceiptCharge(accounts: ChargeAccount[], hint: ReceiptChargeHint) {
  const account = accounts.find((candidate) => candidate.category === hint.category && candidate.sources.length > 0);
  if (!account) return null;

  if (account.sources.length === 1) {
    return { expenseId: account.expenseId, sourceId: account.sources[0].id };
  }

  const receiptText = `${hint.itemName || ''} ${hint.merchant || ''}`.toLowerCase();
  const matchingSources = account.sources.filter((source) => {
    const label = source.label.toLowerCase().trim();
    return label.length >= 4 && receiptText.includes(label);
  });

  return {
    expenseId: account.expenseId,
    sourceId: matchingSources.length === 1 ? matchingSources[0].id : ''
  };
}
