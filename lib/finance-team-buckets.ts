import type { ChargeAccount } from '@/lib/budget-charge-routing';

type RoutedAmount = {
  amount_cents: number;
  budget_expense_item_id: string | null;
  funding_source_id: string | null;
};

export type TeamBucket = ChargeAccount & {
  spentCents: number;
  pendingCents: number;
  sourceTotals: Array<{ id: string; label: string; capCents: number; spentCents: number; pendingCents: number }>;
};

export function buildTeamBuckets(
  accounts: ChargeAccount[],
  approved: RoutedAmount[],
  pending: RoutedAmount[]
): { buckets: TeamBucket[]; unassignedSpentCents: number; unassignedPendingCents: number } {
  const sumFor = (rows: RoutedAmount[], expenseId: string, sourceId?: string) => rows
    .filter((row) => row.budget_expense_item_id === expenseId && (!sourceId || row.funding_source_id === sourceId))
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const knownIds = new Set(accounts.map((account) => account.expenseId));

  return {
    buckets: accounts.map((account) => ({
      ...account,
      spentCents: sumFor(approved, account.expenseId),
      pendingCents: sumFor(pending, account.expenseId),
      sourceTotals: account.sources.map((source) => ({
        id: source.id,
        label: source.label,
        capCents: source.amountCents,
        spentCents: sumFor(approved, account.expenseId, source.id),
        pendingCents: sumFor(pending, account.expenseId, source.id)
      }))
    })),
    unassignedSpentCents: approved.filter((row) => !row.budget_expense_item_id || !knownIds.has(row.budget_expense_item_id))
      .reduce((sum, row) => sum + row.amount_cents, 0),
    unassignedPendingCents: pending.filter((row) => !row.budget_expense_item_id || !knownIds.has(row.budget_expense_item_id))
      .reduce((sum, row) => sum + row.amount_cents, 0)
  };
}
