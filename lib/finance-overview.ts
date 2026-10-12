export type FinanceExpense = {
  id: string;
  kind: string;
  team_id: string | null;
  parent_id: string | null;
  label: string;
  amount_cents: number;
  sort_order: number;
};

export type ClubBucket = {
  id: string;
  label: string;
  budgetCents: number;
  spentCents: number;
};

export function allocatedClubBudgetCents(
  activeTeams: Array<{ id: string }>,
  teamBudgets: ReadonlyMap<string, number>,
  clubBuckets: Array<{ budgetCents: number }>
): number {
  return activeTeams.reduce((sum, team) => sum + (teamBudgets.get(team.id) || 0), 0)
    + clubBuckets.reduce((sum, bucket) => sum + bucket.budgetCents, 0);
}

export function buildClubBuckets(
  expenses: FinanceExpense[],
  purchases: Array<{ budget_expense_item_id: string | null; amount_cents: number }>
): ClubBucket[] {
  const byId = new Map(expenses.map((expense) => [expense.id, expense]));
  const parents = new Set(expenses.map((expense) => expense.parent_id).filter((id): id is string => !!id));
  const spentById = new Map<string, number>();

  for (const purchase of purchases) {
    if (!purchase.budget_expense_item_id) continue;
    spentById.set(
      purchase.budget_expense_item_id,
      (spentById.get(purchase.budget_expense_item_id) || 0) + purchase.amount_cents
    );
  }

  return expenses
    .filter((expense) => expense.kind !== 'team' && !expense.team_id && !parents.has(expense.id) && expense.amount_cents > 0)
    .sort((a, b) => {
      const aParent = a.parent_id ? byId.get(a.parent_id) : null;
      const bParent = b.parent_id ? byId.get(b.parent_id) : null;
      return (aParent?.sort_order ?? a.sort_order) - (bParent?.sort_order ?? b.sort_order)
        || (aParent?.label || a.label).localeCompare(bParent?.label || b.label)
        || a.sort_order - b.sort_order
        || a.label.localeCompare(b.label);
    })
    .map((expense) => ({
      id: expense.id,
      label: expense.parent_id ? `${byId.get(expense.parent_id)?.label || 'Club'} / ${expense.label}` : expense.label,
      budgetCents: expense.amount_cents,
      spentCents: spentById.get(expense.id) || 0
    }));
}
