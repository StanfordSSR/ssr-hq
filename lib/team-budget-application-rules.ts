export const BUDGET_CATEGORIES = ['equipment', 'food', 'travel', 'registration', 'other'] as const;
export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  registration: 'Registration',
  other: 'Other'
};

export type BudgetApplicationItem = {
  id: string;
  category: BudgetCategory;
  description: string;
  amountCents: number;
};

export type BudgetCaps = Record<BudgetCategory, number>;

const NO_OVERAGE_ABOVE_CENTS = 10_000_00;

// Seven days after the October 4, 2026 request, at 7:08 PM Pacific (PDT).
export const TEAM_BUDGET_ACADEMIC_YEAR = '2026-27';
export const TEAM_BUDGET_DEADLINE_AT = '2026-10-12T02:08:00.000Z';

export function isTeamBudgetApplicationClosed(academicYear: string, now = new Date()): boolean {
  return academicYear === TEAM_BUDGET_ACADEMIC_YEAR && now.getTime() >= Date.parse(TEAM_BUDGET_DEADLINE_AT);
}

export function canViewTeamBudgetApplication(role: string, isLead: boolean, isPresident: boolean): boolean {
  return isLead || isPresident || ['admin', 'vice_president', 'financial_officer'].includes(role);
}

export function formatTeamBudgetDeadline(): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short'
  }).format(new Date(TEAM_BUDGET_DEADLINE_AT));
}

export function selectTeamApplicationYear(
  setup: { academicYear: string; nextAcademicYear: string; setupState: 'upcoming' | 'open' | 'closed' },
  requestedYear: string | string[] | undefined
): string {
  const nextIsAvailable = setup.setupState !== 'upcoming';
  if (requestedYear === setup.academicYear) return setup.academicYear;
  if (nextIsAvailable && requestedYear === setup.nextAcademicYear) return setup.nextAcademicYear;
  return nextIsAvailable ? setup.nextAcademicYear : setup.academicYear;
}

export function emptyBudgetCaps(): BudgetCaps {
  return { equipment: 0, food: 0, travel: 0, registration: 0, other: 0 };
}

export function isBudgetCategory(value: unknown): value is BudgetCategory {
  return typeof value === 'string' && BUDGET_CATEGORIES.includes(value as BudgetCategory);
}

export function normalizeApplicationItems(value: unknown): BudgetApplicationItem[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw new Error('An application can have at most 200 line items.');
  }

  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid line item.');
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : '';
    const description = typeof row.description === 'string' ? row.description.trim() : '';
    const amountCents = row.amountCents;
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id) || ids.has(id)) throw new Error('Invalid line item ID.');
    if (!isBudgetCategory(row.category)) throw new Error('Choose a valid category for every line item.');
    if (!description || description.length > 160) throw new Error('Each line item needs a description of at most 160 characters.');
    if (!Number.isSafeInteger(amountCents) || (amountCents as number) < 1 || (amountCents as number) > 100_000_000) {
      throw new Error('Each line item needs an amount between $0.01 and $1,000,000.');
    }
    ids.add(id);
    return { id, category: row.category, description, amountCents: amountCents as number };
  });
}

export function getCategoryRequest(items: BudgetApplicationItem[], category: BudgetCategory, caps: BudgetCaps) {
  const categoryItems = items.filter((item) => item.category === category);
  const totalCents = categoryItems.reduce((sum, item) => sum + item.amountCents, 0);
  const capCents = caps[category];
  const teamCapCents = BUDGET_CATEGORIES.reduce((sum, current) => sum + caps[current], 0);
  const maxCents = teamCapCents > NO_OVERAGE_ABOVE_CENTS ? capCents : Math.floor((capCents * 110) / 100);
  const requiredItemCount = Math.ceil(totalCents / 100_000);
  return {
    totalCents,
    itemCount: categoryItems.length,
    requiredItemCount,
    overCap: totalCents > capCents,
    overLimit: totalCents > maxCents,
    maxCents,
    missingItems: Math.max(0, requiredItemCount - categoryItems.length)
  };
}

export function getSubmissionError(items: BudgetApplicationItem[], caps: BudgetCaps): string | null {
  if (items.length === 0) return 'Add at least one line item before submitting.';
  for (const category of BUDGET_CATEGORIES) {
    const request = getCategoryRequest(items, category, caps);
    if (request.overLimit) {
      return `${BUDGET_CATEGORY_LABELS[category]} exceeds its category cap. Reduce the request before submitting.`;
    }
    if (request.missingItems > 0) {
      return `${BUDGET_CATEGORY_LABELS[category]} needs ${request.missingItems} more line item${request.missingItems === 1 ? '' : 's'} (about one per $1,000 requested).`;
    }
  }
  return null;
}

export function formatBudgetMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
