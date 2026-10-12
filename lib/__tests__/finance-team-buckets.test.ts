import { describe, expect, it } from 'vitest';
import { buildTeamBuckets } from '@/lib/finance-team-buckets';
import type { ChargeAccount } from '@/lib/budget-charge-routing';

const accounts: ChargeAccount[] = [{
  expenseId: 'other', label: 'SkyRunners — Other', category: 'other', capCents: 500000,
  sources: [
    { id: 'hoover', label: 'Hoover', amountCents: 250000 },
    { id: 'soe', label: 'SoE Grant', amountCents: 250000 }
  ]
}];

describe('finance team buckets', () => {
  it('separates approved spend from pending submissions by funding source', () => {
    const result = buildTeamBuckets(accounts,
      [{ budget_expense_item_id: 'other', funding_source_id: 'hoover', amount_cents: 4000 }],
      [{ budget_expense_item_id: 'other', funding_source_id: 'soe', amount_cents: 3000 }]);
    expect(result.buckets[0].spentCents).toBe(4000);
    expect(result.buckets[0].pendingCents).toBe(3000);
    expect(result.buckets[0].sourceTotals.map((source) => [source.spentCents, source.pendingCents])).toEqual([[4000, 0], [0, 3000]]);
  });

  it('keeps legacy unrouted amounts visible without assigning them to an arbitrary source', () => {
    const result = buildTeamBuckets(accounts,
      [{ budget_expense_item_id: null, funding_source_id: null, amount_cents: 1000 }], []);
    expect(result.unassignedSpentCents).toBe(1000);
    expect(result.buckets[0].spentCents).toBe(0);
  });
});
