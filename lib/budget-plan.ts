import { createAdminClient } from '@/lib/supabase-admin';
import {
  formatCountdown,
  formatDateLabel,
  getAcademicCalendarSettings,
  getAcademicCalendarTemplate,
  getCurrentAcademicYear,
  getReportingWindows,
  type ReportingWindow
} from '@/lib/academic-calendar';

export const EXPENSE_CATEGORIES = ['equipment', 'food', 'travel', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type LockCadence = 'yearly' | 'quarterly' | 'unlocked';
export type BudgetPlanStatus = 'draft' | 'pending_approval' | 'approved' | 'superseded';

export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  other: 'Other'
};

export type BudgetPlanSettings = {
  openMonthDay: string;
  quarterLeadDays: number;
  slackEnabled: boolean;
};

export type BudgetSetupState = {
  academicYear: string;
  nextAcademicYear: string;
  setupState: 'upcoming' | 'open' | 'closed';
  openAt: Date;
  nextCycleStart: Date;
  message: string;
  countdownLabel: string;
};

export type QuarterDeclarationState = {
  academicYear: string;
  quarter: string;
  openAt: Date;
  quarterStart: Date;
  quarterEnd: Date;
} | null;

export type BudgetPlan = {
  id: string;
  academicYear: string;
  version: number;
  status: BudgetPlanStatus;
  totalFundingCents: number;
  submittedAt: string | null;
  approvedAt: string | null;
};

export type FundingSource = {
  id: string;
  label: string;
  kind: 'annual_grant' | 'reserve_grant' | 'grant' | 'sponsorship' | 'other';
  category: ExpenseCategory | null;
  amountCents: number;
  isDefaultPool: boolean;
  locked: boolean;
  notes: string | null;
  sortOrder: number;
};

export type ExpenseItem = {
  id: string;
  kind: 'team' | 'event' | 'operations' | 'general';
  teamId: string | null;
  parentId: string | null;
  category: ExpenseCategory | null;
  label: string;
  amountCents: number;
  lockCadence: LockCadence;
  locked: boolean;
  notes: string | null;
  sortOrder: number;
};

export type Allocation = {
  id: string;
  sourceId: string;
  expenseId: string;
  amountCents: number;
};

export type BudgetApproval = {
  presidentId: string;
  presidentEmail: string;
  decision: 'approved' | 'rejected';
  hasSignature: boolean;
  source: 'portal' | 'slack';
  decidedAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function pacificDate(year: number, monthDay: string) {
  return new Date(`${year}-${monthDay}T12:00:00-08:00`);
}

function startYearOf(academicYear: string) {
  const parsed = Number(academicYear.slice(0, 4));
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

export async function getBudgetPlanSettings(): Promise<BudgetPlanSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('budget_plan_settings')
    .select('open_month_day, quarter_lead_days, slack_enabled')
    .eq('id', 1)
    .maybeSingle();
  return {
    openMonthDay: /^\d{2}-\d{2}$/.test(data?.open_month_day || '') ? data!.open_month_day : '06-01',
    quarterLeadDays: Number.isFinite(data?.quarter_lead_days) ? data!.quarter_lead_days : 14,
    slackEnabled: data?.slack_enabled ?? true
  };
}

export async function getBudgetSetupState(now = new Date()): Promise<BudgetSetupState> {
  const [settings, template, planSettings] = await Promise.all([
    getAcademicCalendarSettings(now),
    getAcademicCalendarTemplate(),
    getBudgetPlanSettings()
  ]);
  const nextAcademicYear = settings.nextAcademicYear;
  const nextStartYear = startYearOf(nextAcademicYear);
  const nextCycleStart = pacificDate(nextStartYear, template.autumnStartMonthDay);
  const openAt = pacificDate(nextStartYear, planSettings.openMonthDay);

  let setupState: BudgetSetupState['setupState'];
  let message: string;
  let countdownTarget: Date;
  if (now < openAt) {
    setupState = 'upcoming';
    message = `Budget setup for ${nextAcademicYear} opens on ${formatDateLabel(openAt)}.`;
    countdownTarget = openAt;
  } else if (now < nextCycleStart) {
    setupState = 'open';
    message = `Budget setup for ${nextAcademicYear} is open until the new cycle begins on ${formatDateLabel(nextCycleStart)}.`;
    countdownTarget = nextCycleStart;
  } else {
    setupState = 'closed';
    message = `The ${settings.effectiveAcademicYear} budget is in effect.`;
    countdownTarget = nextCycleStart;
  }

  return {
    academicYear: settings.effectiveAcademicYear,
    nextAcademicYear,
    setupState,
    openAt,
    nextCycleStart,
    message,
    countdownLabel: formatCountdown(countdownTarget, now)
  };
}

// The quarter (of the current academic year) whose re-declaration window is open.
export async function getQuarterDeclarationState(now = new Date()): Promise<QuarterDeclarationState> {
  const [academicYear, planSettings] = await Promise.all([getCurrentAcademicYear(now), getBudgetPlanSettings()]);
  const windows = await getReportingWindows(academicYear);
  for (const window of windows) {
    const openAt = new Date(window.start.getTime() - planSettings.quarterLeadDays * DAY_MS);
    if (now >= openAt && now <= window.end) {
      return {
        academicYear,
        quarter: window.quarter,
        openAt,
        quarterStart: window.start,
        quarterEnd: window.end
      };
    }
  }
  return null;
}

function currentQuarterFor(windows: ReportingWindow[], now: Date): ReportingWindow | null {
  return windows.find((window) => now >= window.start && now <= window.end) || null;
}

export async function getActiveBudgetPlan(academicYear: string): Promise<BudgetPlan | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('budget_plans')
    .select('id, academic_year, version, status, total_funding_cents, submitted_at, approved_at')
    .eq('academic_year', academicYear)
    .neq('status', 'superseded')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    academicYear: data.academic_year,
    version: data.version,
    status: data.status,
    totalFundingCents: data.total_funding_cents,
    submittedAt: data.submitted_at,
    approvedAt: data.approved_at
  };
}

export async function getPlanBundle(planId: string) {
  const admin = createAdminClient();
  const [{ data: sources }, { data: expenses }, { data: allocations }, { data: approvals }] = await Promise.all([
    admin
      .from('budget_funding_sources')
      .select('id, label, kind, category, amount_cents, is_default_pool, locked, notes, sort_order')
      .eq('plan_id', planId)
      .order('sort_order'),
    admin
      .from('budget_expense_items')
      .select('id, kind, team_id, parent_id, category, label, amount_cents, lock_cadence, locked, notes, sort_order')
      .eq('plan_id', planId)
      .order('sort_order'),
    admin.from('budget_allocations').select('id, source_id, expense_id, amount_cents').eq('plan_id', planId),
    admin
      .from('budget_approvals')
      .select('president_id, president_email, decision, signature, source, decided_at')
      .eq('target_type', 'plan')
      .eq('target_id', planId)
  ]);

  return {
    sources: ((sources || []) as Array<Record<string, unknown>>).map(
      (row): FundingSource => ({
        id: row.id as string,
        label: row.label as string,
        kind: row.kind as FundingSource['kind'],
        category: (row.category as ExpenseCategory) ?? null,
        amountCents: row.amount_cents as number,
        isDefaultPool: row.is_default_pool as boolean,
        locked: row.locked as boolean,
        notes: (row.notes as string) ?? null,
        sortOrder: row.sort_order as number
      })
    ),
    expenses: ((expenses || []) as Array<Record<string, unknown>>).map(
      (row): ExpenseItem => ({
        id: row.id as string,
        kind: row.kind as ExpenseItem['kind'],
        teamId: (row.team_id as string) ?? null,
        parentId: (row.parent_id as string) ?? null,
        category: (row.category as ExpenseCategory) ?? null,
        label: row.label as string,
        amountCents: row.amount_cents as number,
        lockCadence: row.lock_cadence as LockCadence,
        locked: row.locked as boolean,
        notes: (row.notes as string) ?? null,
        sortOrder: row.sort_order as number
      })
    ),
    allocations: ((allocations || []) as Array<Record<string, unknown>>).map(
      (row): Allocation => ({
        id: row.id as string,
        sourceId: row.source_id as string,
        expenseId: row.expense_id as string,
        amountCents: row.amount_cents as number
      })
    ),
    approvals: ((approvals || []) as Array<Record<string, unknown>>).map(
      (row): BudgetApproval => ({
        presidentId: row.president_id as string,
        presidentEmail: row.president_email as string,
        decision: row.decision as 'approved' | 'rejected',
        hasSignature: Boolean(row.signature),
        source: row.source as 'portal' | 'slack',
        decidedAt: row.decided_at as string
      })
    )
  };
}

export type PlanRollup = {
  totalFundingCents: number;
  totalExpenseCents: number;
  perExpense: Map<
    string,
    { effectiveCents: number; allocatedCents: number; remainderFromGrantCents: number; spentCents: number; remainingCents: number }
  >;
  perSource: Map<string, { committedCents: number; remainingCents: number }>;
  perTeam: Map<string, { budgetCents: number; spentCents: number }>;
  defaultPoolId: string | null;
  overAllocatedSources: string[];
  uncoveredCents: number;
};

// Computes funding/expense rollups + actual spend for a plan. The default-pool
// source absorbs every expense's unallocated remainder.
export async function computePlanRollup(planId: string, academicYear: string, now = new Date()): Promise<PlanRollup> {
  const admin = createAdminClient();
  const { sources, expenses, allocations } = await getPlanBundle(planId);

  const windows = await getReportingWindows(academicYear);
  const currentQuarter = currentQuarterFor(windows, now);

  // Approved quarterly values for the current quarter (effective amounts for quarterly items).
  const quarterlyEffective = new Map<string, number>();
  if (currentQuarter) {
    const { data: decl } = await admin
      .from('budget_quarter_declarations')
      .select('id')
      .eq('plan_id', planId)
      .eq('quarter', currentQuarter.quarter)
      .eq('status', 'approved')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (decl) {
      const { data: values } = await admin
        .from('budget_quarterly_values')
        .select('expense_item_id, amount_cents')
        .eq('declaration_id', decl.id);
      for (const value of values || []) {
        quarterlyEffective.set(value.expense_item_id, value.amount_cents);
      }
    }
  }

  // Actual spend grouped by (team_id, category) for this academic year.
  const { data: purchases } = await admin
    .from('purchase_logs')
    .select('team_id, category, amount_cents')
    .eq('academic_year', academicYear)
    .eq('expense_type', 'team');
  const spendByTeamCategory = new Map<string, number>();
  for (const purchase of (purchases || []) as Array<{ team_id: string | null; category: string | null; amount_cents: number }>) {
    const key = `${purchase.team_id || ''}:${purchase.category || 'other'}`;
    spendByTeamCategory.set(key, (spendByTeamCategory.get(key) || 0) + purchase.amount_cents);
  }

  const allocatedByExpense = new Map<string, number>();
  const committedBySource = new Map<string, number>();
  for (const alloc of allocations) {
    allocatedByExpense.set(alloc.expenseId, (allocatedByExpense.get(alloc.expenseId) || 0) + alloc.amountCents);
    committedBySource.set(alloc.sourceId, (committedBySource.get(alloc.sourceId) || 0) + alloc.amountCents);
  }

  // Each category's annual-grant source covers the remainder of expenses in that
  // category (events/operations fall back to the "other" grant).
  const grantByCategory = new Map<string, string>();
  for (const source of sources) {
    if (source.kind === 'annual_grant') {
      grantByCategory.set(source.category || 'other', source.id);
    }
  }
  const grantFor = (category: string | null) =>
    grantByCategory.get(category || 'other') || grantByCategory.get('other') || null;
  const defaultPool = sources.find((source) => source.isDefaultPool) || null;

  const perExpense: PlanRollup['perExpense'] = new Map();
  const perTeam: PlanRollup['perTeam'] = new Map();
  const remainderByGrant = new Map<string, number>();
  let totalExpenseCents = 0;

  const effectiveOf = (expense: ExpenseItem) =>
    expense.lockCadence === 'quarterly' && quarterlyEffective.has(expense.id)
      ? quarterlyEffective.get(expense.id)!
      : expense.amountCents;

  const childrenByParent = new Map<string, ExpenseItem[]>();
  for (const expense of expenses) {
    if (expense.parentId) {
      if (!childrenByParent.has(expense.parentId)) childrenByParent.set(expense.parentId, []);
      childrenByParent.get(expense.parentId)!.push(expense);
    }
  }

  for (const expense of expenses) {
    const children = !expense.parentId ? childrenByParent.get(expense.id) : undefined;

    // A container (event/ops split into sub-items) aggregates its children and
    // is not counted on its own — the children carry the amounts and routing.
    if (children && children.length > 0) {
      let effectiveSum = 0;
      let allocatedSum = 0;
      let remainderSum = 0;
      for (const child of children) {
        const childEffective = effectiveOf(child);
        const childAllocated = Math.min(childEffective, allocatedByExpense.get(child.id) || 0);
        effectiveSum += childEffective;
        allocatedSum += childAllocated;
        remainderSum += Math.max(0, childEffective - childAllocated);
      }
      perExpense.set(expense.id, {
        effectiveCents: effectiveSum,
        allocatedCents: allocatedSum,
        remainderFromGrantCents: remainderSum,
        spentCents: 0,
        remainingCents: effectiveSum
      });
      continue;
    }

    const effectiveCents = effectiveOf(expense);
    const allocatedCents = Math.min(effectiveCents, allocatedByExpense.get(expense.id) || 0);
    const remainderFromGrantCents = Math.max(0, effectiveCents - allocatedCents);
    const grantId = grantFor(expense.category);
    if (grantId && remainderFromGrantCents > 0) {
      remainderByGrant.set(grantId, (remainderByGrant.get(grantId) || 0) + remainderFromGrantCents);
    }

    const spentCents = expense.teamId
      ? spendByTeamCategory.get(`${expense.teamId}:${expense.category || 'other'}`) || 0
      : 0;

    perExpense.set(expense.id, {
      effectiveCents,
      allocatedCents,
      remainderFromGrantCents,
      spentCents,
      remainingCents: Math.max(0, effectiveCents - spentCents)
    });
    totalExpenseCents += effectiveCents;

    if (expense.teamId) {
      const team = perTeam.get(expense.teamId) || { budgetCents: 0, spentCents: 0 };
      team.budgetCents += effectiveCents;
      team.spentCents += spentCents;
      perTeam.set(expense.teamId, team);
    }
  }

  const perSource: PlanRollup['perSource'] = new Map();
  const overAllocatedSources: string[] = [];
  for (const source of sources) {
    const committed = (committedBySource.get(source.id) || 0) + (remainderByGrant.get(source.id) || 0);
    perSource.set(source.id, { committedCents: committed, remainingCents: source.amountCents - committed });
    if (committed > source.amountCents) {
      overAllocatedSources.push(source.id);
    }
  }

  const totalFundingCents = sources.reduce((sum, source) => sum + source.amountCents, 0);

  return {
    totalFundingCents,
    totalExpenseCents,
    perExpense,
    perSource,
    perTeam,
    defaultPoolId: defaultPool?.id || null,
    overAllocatedSources,
    uncoveredCents: Math.max(0, totalExpenseCents - totalFundingCents)
  };
}
