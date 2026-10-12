import { describe, expect, it } from 'vitest';
import { buildClubBuckets, type FinanceExpense } from '../finance-overview';

const expenses: FinanceExpense[] = [
  { id: 'team', kind: 'team', team_id: 'one', parent_id: null, label: 'Equipment', amount_cents: 700000, sort_order: 0 },
  { id: 'parent', kind: 'operations', team_id: null, parent_id: null, label: 'Leadership', amount_cents: 0, sort_order: 2 },
  { id: 'food', kind: 'operations', team_id: null, parent_id: 'parent', label: 'Food', amount_cents: 25000, sort_order: 1 },
  { id: 'equipment', kind: 'operations', team_id: null, parent_id: 'parent', label: 'Equipment', amount_cents: 500000, sort_order: 0 },
  { id: 'event', kind: 'event', team_id: null, parent_id: null, label: 'Showcase', amount_cents: 100000, sort_order: 1 }
];

describe('buildClubBuckets', () => {
  it('uses non-team leaf amounts without counting containers twice', () => {
    const buckets = buildClubBuckets(expenses, [
      { budget_expense_item_id: 'equipment', amount_cents: 5500 },
      { budget_expense_item_id: 'food', amount_cents: 1200 },
      { budget_expense_item_id: null, amount_cents: 800 }
    ]);

    expect(buckets).toEqual([
      { id: 'event', label: 'Showcase', budgetCents: 100000, spentCents: 0 },
      { id: 'equipment', label: 'Leadership / Equipment', budgetCents: 500000, spentCents: 5500 },
      { id: 'food', label: 'Leadership / Food', budgetCents: 25000, spentCents: 1200 }
    ]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.budgetCents, 0)).toBe(625000);
  });

  it('keeps a standalone club bucket when it has no children', () => {
    expect(buildClubBuckets([expenses[4]], [])).toEqual([
      { id: 'event', label: 'Showcase', budgetCents: 100000, spentCents: 0 }
    ]);
  });
});
