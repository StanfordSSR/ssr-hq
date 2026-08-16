// Pure budget/spend math shared by the dashboards, team hub, and finance pages.
//
// This logic previously lived inline and duplicated across several server
// components, which made it impossible to test and easy to drift. Everything
// here is a pure function of its inputs: no I/O, no clock reads, no Supabase.
// Amounts are always integer cents.

export type PurchaseCategory = 'equipment' | 'food' | 'travel' | 'registration';

export const PURCHASE_CATEGORIES: PurchaseCategory[] = ['equipment', 'food', 'travel', 'registration'];

// Display colors for category charts, shared by the donut and the bars so the
// legend can never disagree with the slices.
export const CATEGORY_COLORS: Record<PurchaseCategory, string> = {
  equipment: '#8c1515',
  food: '#d17c3f',
  travel: '#3f6e8f',
  registration: '#5b8c5a'
};

export const UNSPENT_COLOR = '#e8e1de';

export function sumAmounts(rows: Array<{ amount_cents: number }>): number {
  return rows.reduce((sum, row) => sum + row.amount_cents, 0);
}

// Budget left. Deliberately NOT clamped at zero: overspending is real and the
// UI needs the negative number to show "over by X".
export function remainingCents(budgetCents: number, spentCents: number): number {
  return budgetCents - spentCents;
}

// Percent of budget consumed, clamped to 0..100 for bar widths. Returns 0 when
// no budget is set so a missing budget never renders a full bar.
export function utilizationPercent(budgetCents: number, spentCents: number): number {
  if (budgetCents <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((spentCents / budgetCents) * 100)));
}

export function isOverBudget(budgetCents: number, spentCents: number): boolean {
  return budgetCents > 0 && spentCents > budgetCents;
}

// Total per category. Rows with a missing/unknown category count as equipment,
// matching how the ledger and the purchase logger treat untyped purchases.
export function categoryTotals(
  rows: Array<{ amount_cents: number; category?: string | null }>
): Record<PurchaseCategory, number> {
  const totals: Record<PurchaseCategory, number> = {
    equipment: 0,
    food: 0,
    travel: 0,
    registration: 0
  };
  for (const row of rows) {
    const key = (row.category || 'equipment') as PurchaseCategory;
    const bucket = PURCHASE_CATEGORIES.includes(key) ? key : 'equipment';
    totals[bucket] += row.amount_cents;
  }
  return totals;
}

// Denominator for share-of-budget charts: the annual budget, unless spending
// has already exceeded it (or no budget is set), in which case shares are of
// total spend so the chart never renders slices past 100%.
export function chartDenominator(budgetCents: number, spentCents: number): number {
  return Math.max(budgetCents, spentCents);
}

export type DonutSlice = { color: string; start: number; end: number };

// Ordered conic-gradient slices for the category donut, with the unspent
// remainder appended in grey. Zero-value categories are skipped so they don't
// contribute invisible seams.
export function donutSlices(
  totals: Record<PurchaseCategory, number>,
  denominator: number
): DonutSlice[] {
  if (denominator <= 0) return [];
  const slices: DonutSlice[] = [];
  let cursor = 0;
  for (const category of PURCHASE_CATEGORIES) {
    const amount = totals[category];
    if (amount <= 0) continue;
    const start = cursor;
    const end = cursor + (amount / denominator) * 100;
    cursor = end;
    slices.push({ color: CATEGORY_COLORS[category], start, end });
  }
  if (cursor < 100) {
    slices.push({ color: UNSPENT_COLOR, start: cursor, end: 100 });
  }
  return slices;
}

export function donutGradient(slices: DonutSlice[]): string {
  if (slices.length === 0) return `conic-gradient(${UNSPENT_COLOR} 0 100%)`;
  return `conic-gradient(${slices.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`;
}

// Average purchase size, rounded to whole cents. Zero for an empty list rather
// than NaN.
export function averagePurchaseCents(rows: Array<{ amount_cents: number }>): number {
  if (rows.length === 0) return 0;
  return Math.round(sumAmounts(rows) / rows.length);
}

export function costPerMemberCents(spentCents: number, memberCount: number): number {
  if (memberCount <= 0) return 0;
  return Math.round(spentCents / memberCount);
}

// Purchases at or above a threshold, newest first. Used for the officer
// "big-ticket items" panel.
export function bigTicketPurchases<T extends { amount_cents: number; purchased_at: string }>(
  rows: T[],
  thresholdCents: number,
  limit?: number
): T[] {
  const filtered = rows
    .filter((row) => row.amount_cents >= thresholdCents)
    .sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at));
  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
}

// Sum of purchases whose Pacific date-key falls inside [startKey, endKey]
// inclusive. Keys are 'YYYY-MM-DD' strings so comparison is lexicographic and
// timezone-safe.
export function sumInDateRange(
  rows: Array<{ amount_cents: number; purchased_at: string }>,
  startKey: string,
  endKey: string,
  toKey: (date: Date) => string
): number {
  if (!startKey || !endKey) return 0;
  return rows.reduce((sum, row) => {
    const key = toKey(new Date(row.purchased_at));
    return key >= startKey && key <= endKey ? sum + row.amount_cents : sum;
  }, 0);
}

// Club-level allocation view: how much of the total budget is handed out to
// teams, and what's left unallocated.
export function allocationSummary(totalBudgetCents: number, teamBudgets: number[]) {
  const allocatedCents = teamBudgets.reduce((sum, value) => sum + value, 0);
  return {
    allocatedCents,
    unallocatedCents: Math.max(0, totalBudgetCents - allocatedCents),
    allocationPercent: utilizationPercent(totalBudgetCents, allocatedCents),
    overAllocated: allocatedCents > totalBudgetCents
  };
}
