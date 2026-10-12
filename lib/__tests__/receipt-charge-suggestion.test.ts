import { describe, expect, it } from 'vitest';
import { suggestReceiptCharge } from '@/lib/receipt-charge-suggestion';
import type { ChargeAccount } from '@/lib/budget-charge-routing';

const accounts: ChargeAccount[] = [
  { expenseId: 'equipment', label: 'Equipment', category: 'equipment', capCents: 100000, sources: [{ id: 'grant', label: 'Annual Grant', amountCents: 100000 }] },
  { expenseId: 'other', label: 'Other', category: 'other', capCents: 500000, sources: [
    { id: 'hoover', label: 'Hoover', amountCents: 250000 },
    { id: 'soe', label: 'SoE Grant', amountCents: 250000 }
  ] }
];

describe('suggestReceiptCharge', () => {
  it('selects the only funded source for a matching category', () => {
    expect(suggestReceiptCharge(accounts, { category: 'equipment', itemName: 'Propellers', merchant: 'Shop' }))
      .toEqual({ expenseId: 'equipment', sourceId: 'grant' });
  });

  it('leaves an ambiguous funding source for the lead to choose', () => {
    expect(suggestReceiptCharge(accounts, { category: 'other', itemName: 'Team supplies', merchant: 'Shop' }))
      .toEqual({ expenseId: 'other', sourceId: '' });
  });

  it('uses an explicitly named funding source', () => {
    expect(suggestReceiptCharge(accounts, { category: 'other', itemName: 'SoE Grant supplies', merchant: 'Shop' }))
      .toEqual({ expenseId: 'other', sourceId: 'soe' });
  });

  it('does not suggest an unavailable category', () => {
    expect(suggestReceiptCharge(accounts, { category: 'food', itemName: 'Pizza', merchant: 'Shop' })).toBeNull();
  });
});
