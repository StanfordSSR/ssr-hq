import { getActiveBudgetPlan, type ExpenseCategory } from '@/lib/budget-plan';
import { createAdminClient } from '@/lib/supabase-admin';

export type ChargeSource = { id: string; label: string; amountCents: number };
export type ChargeAccount = {
  expenseId: string;
  label: string;
  category: ExpenseCategory | null;
  capCents: number;
  sources: ChargeSource[];
};
export type ChargeCatalog = {
  planId: string;
  teams: Record<string, ChargeAccount[]>;
  leadership: ChargeAccount[];
};
export type ResolvedCharge = {
  planId: string;
  expenseId: string;
  expenseLabel: string;
  category: ExpenseCategory | null;
  sourceId: string;
  sourceLabel: string;
};

type ExpenseRow = {
  id: string;
  team_id: string | null;
  kind: string;
  parent_id: string | null;
  category: ExpenseCategory | null;
  label: string;
  amount_cents: number;
  sort_order: number;
};
type SourceRow = {
  id: string;
  label: string;
  kind: string;
  category: ExpenseCategory | null;
  sort_order: number;
};
type AllocationRow = { source_id: string; expense_id: string; amount_cents: number };

export function buildChargeCatalog(
  planId: string,
  expenses: ExpenseRow[],
  sources: SourceRow[],
  allocations: AllocationRow[]
): ChargeCatalog {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const grants = new Map(
    sources.filter((source) => source.kind === 'annual_grant').map((source) => [source.category || 'other', source])
  );
  const children = new Set(expenses.map((expense) => expense.parent_id).filter(Boolean));
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]));
  const catalog: ChargeCatalog = { planId, teams: {}, leadership: [] };

  for (const expense of expenses) {
    if (children.has(expense.id)) continue;
    if (expense.kind !== 'team' && expense.kind !== 'operations') continue;
    if (expense.kind === 'team' && (!expense.team_id || !expense.category || expense.parent_id)) continue;

    const explicit = allocations.filter((allocation) => allocation.expense_id === expense.id && allocation.amount_cents > 0);
    const accountSources: ChargeSource[] = explicit.flatMap((allocation) => {
      const source = sourceById.get(allocation.source_id);
      return source ? [{ id: source.id, label: source.label, amountCents: allocation.amount_cents }] : [];
    });
    const allocatedCents = explicit.reduce((sum, allocation) => sum + allocation.amount_cents, 0);
    const remainderCents = Math.max(0, expense.amount_cents - allocatedCents);
    const grant = grants.get(expense.category || 'other') || grants.get('other');
    if (grant && (remainderCents > 0 || accountSources.length === 0)) {
      accountSources.push({ id: grant.id, label: grant.label, amountCents: remainderCents });
    }

    const account: ChargeAccount = {
      expenseId: expense.id,
      label: expense.kind === 'operations' && expense.parent_id
        ? `${expenseById.get(expense.parent_id)?.label || 'Club'} / ${expense.label}`
        : expense.label,
      category: expense.kind === 'team' ? expense.category : null,
      capCents: expense.amount_cents,
      sources: accountSources.sort((a, b) =>
        (sourceById.get(a.id)?.sort_order || 0) - (sourceById.get(b.id)?.sort_order || 0)
      )
    };
    if (expense.kind === 'team' && expense.team_id) {
      (catalog.teams[expense.team_id] ||= []).push(account);
    } else {
      catalog.leadership.push(account);
    }
  }

  const orderByPlan = (a: ChargeAccount, b: ChargeAccount) => {
    const first = expenses.find((expense) => expense.id === a.expenseId)?.sort_order || 0;
    const second = expenses.find((expense) => expense.id === b.expenseId)?.sort_order || 0;
    return first - second;
  };
  for (const accounts of Object.values(catalog.teams)) accounts.sort(orderByPlan);
  catalog.leadership.sort(orderByPlan);
  return catalog;
}

export async function getChargeCatalog(academicYear: string): Promise<ChargeCatalog | null> {
  const plan = await getActiveBudgetPlan(academicYear);
  if (!plan) return null;
  const admin = createAdminClient();
  const [{ data: expenses, error: expenseError }, { data: sources, error: sourceError }, { data: allocations, error: allocationError }] =
    await Promise.all([
      admin.from('budget_expense_items')
        .select('id, team_id, kind, parent_id, category, label, amount_cents, sort_order')
        .eq('plan_id', plan.id),
      admin.from('budget_funding_sources')
        .select('id, label, kind, category, sort_order')
        .eq('plan_id', plan.id),
      admin.from('budget_allocations')
        .select('source_id, expense_id, amount_cents')
        .eq('plan_id', plan.id)
    ]);
  if (expenseError || sourceError || allocationError) {
    throw new Error('Could not load the current budget accounts. Please try again.');
  }
  return buildChargeCatalog(plan.id, (expenses || []) as ExpenseRow[], (sources || []) as SourceRow[], (allocations || []) as AllocationRow[]);
}

export function resolveCharge(
  catalog: ChargeCatalog | null,
  scope: 'team' | 'leadership',
  teamId: string | null,
  expenseId: string,
  sourceId: string
): ResolvedCharge {
  const accounts = scope === 'leadership' ? catalog?.leadership : catalog?.teams[teamId || ''];
  const account = accounts?.find((candidate) => candidate.expenseId === expenseId);
  if (!catalog || !account) throw new Error('Choose a budget category from the current plan.');
  if (account.sources.length === 0) throw new Error('This budget category has no funding source. Ask leadership to update the plan.');
  const selectedId = sourceId || (account.sources.length === 1 ? account.sources[0].id : '');
  const source = account.sources.find((candidate) => candidate.id === selectedId);
  if (!source) throw new Error('Choose a funding source for this category.');
  return {
    planId: catalog.planId,
    expenseId: account.expenseId,
    expenseLabel: account.label,
    category: account.category,
    sourceId: source.id,
    sourceLabel: source.label
  };
}
