import { createAdminClient } from '@/lib/supabase-admin';

type ExpenseRef = {
  id: string;
  plan_id: string;
  kind: string;
  team_id: string | null;
  parent_id: string | null;
  category: string | null;
  label: string;
};

type SourceRef = {
  id: string;
  plan_id: string;
  kind: string;
  category: string | null;
  label: string;
};

export type BudgetReferenceAliases = {
  expenseIds: ReadonlyMap<string, string>;
  sourceIds: ReadonlyMap<string, string>;
};

const emptyAliases: BudgetReferenceAliases = { expenseIds: new Map(), sourceIds: new Map() };

function uniqueCurrentIds<T extends { id: string }>(rows: T[], keyOf: (row: T) => string) {
  const ids = new Map<string, string | null>();
  for (const row of rows) {
    const key = keyOf(row);
    ids.set(key, ids.has(key) ? null : row.id);
  }
  return ids;
}

export function buildBudgetReferenceAliases(
  activePlanId: string,
  expenses: ExpenseRef[],
  sources: SourceRef[]
): BudgetReferenceAliases {
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const expenseKey = (expense: ExpenseRef) => {
    const parent = expense.parent_id ? expenseById.get(expense.parent_id) : null;
    return JSON.stringify([
      expense.kind, expense.team_id, expense.category, expense.label,
      parent?.kind || null, parent?.label || null
    ]);
  };
  const sourceKey = (source: SourceRef) => JSON.stringify([source.kind, source.category, source.label]);
  const currentExpenses = uniqueCurrentIds(expenses.filter((row) => row.plan_id === activePlanId), expenseKey);
  const currentSources = uniqueCurrentIds(sources.filter((row) => row.plan_id === activePlanId), sourceKey);
  const expenseIds = new Map<string, string>();
  const sourceIds = new Map<string, string>();

  for (const expense of expenses) {
    if (expense.plan_id === activePlanId) continue;
    const currentId = currentExpenses.get(expenseKey(expense));
    if (currentId) expenseIds.set(expense.id, currentId);
  }
  for (const source of sources) {
    if (source.plan_id === activePlanId) continue;
    const currentId = currentSources.get(sourceKey(source));
    if (currentId) sourceIds.set(source.id, currentId);
  }
  return { expenseIds, sourceIds };
}

export async function getBudgetReferenceAliases(
  academicYear: string,
  activePlanId: string | null | undefined
): Promise<BudgetReferenceAliases> {
  if (!activePlanId) return emptyAliases;
  const admin = createAdminClient();
  const { data: priorPlans, error: planError } = await admin
    .from('budget_plans')
    .select('id')
    .eq('academic_year', academicYear)
    .eq('status', 'superseded');
  if (planError) throw new Error('Could not load prior budget plan versions.');
  if (!priorPlans?.length) return emptyAliases;

  const planIds = [activePlanId, ...priorPlans.map((plan) => plan.id)];
  const [{ data: expenses, error: expenseError }, { data: sources, error: sourceError }] = await Promise.all([
    admin.from('budget_expense_items')
      .select('id, plan_id, kind, team_id, parent_id, category, label')
      .in('plan_id', planIds),
    admin.from('budget_funding_sources')
      .select('id, plan_id, kind, category, label')
      .in('plan_id', planIds)
  ]);
  if (expenseError || sourceError) throw new Error('Could not match prior budget accounts.');
  return buildBudgetReferenceAliases(activePlanId, expenses as ExpenseRef[], sources as SourceRef[]);
}

export function remapBudgetReferences<T extends {
  budget_expense_item_id: string | null;
  funding_source_id: string | null;
}>(rows: T[], aliases: BudgetReferenceAliases): T[] {
  if (aliases.expenseIds.size === 0 && aliases.sourceIds.size === 0) return rows;
  return rows.map((row) => ({
    ...row,
    budget_expense_item_id: aliases.expenseIds.get(row.budget_expense_item_id || '') || row.budget_expense_item_id,
    funding_source_id: aliases.sourceIds.get(row.funding_source_id || '') || row.funding_source_id
  }));
}
