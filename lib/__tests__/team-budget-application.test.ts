import { describe, expect, it } from 'vitest';
import {
  canViewTeamBudgetApplication,
  emptyBudgetCaps,
  getCategoryRequest,
  getSubmissionError,
  formatTeamBudgetDeadline,
  isTeamBudgetApplicationClosed,
  normalizeApplicationItems,
  selectTeamApplicationYear,
  type BudgetApplicationItem
} from '@/lib/team-budget-application-rules';

const equipment = (amountCents: number, index = 1): BudgetApplicationItem => ({
  id: `item-${index}`,
  category: 'equipment',
  description: `Equipment ${index}`,
  amountCents
});

describe('budget application access and deadline', () => {
  const before = new Date('2026-10-12T02:07:59.999Z');
  const deadline = new Date('2026-10-12T02:08:00.000Z');

  it('closes at 7:08 PM Pacific on October 11', () => {
    expect(isTeamBudgetApplicationClosed('2026-27', before)).toBe(false);
    expect(isTeamBudgetApplicationClosed('2026-27', deadline)).toBe(true);
    expect(isTeamBudgetApplicationClosed('2027-28', deadline)).toBe(false);
    expect(formatTeamBudgetDeadline()).toContain('Oct 11, 2026');
    expect(formatTeamBudgetDeadline()).toContain('7:08 PM');
  });

  it('lets active leads and reviewing officers view the form immediately', () => {
    expect(canViewTeamBudgetApplication('team_lead', true, false)).toBe(true);
    expect(canViewTeamBudgetApplication('president', false, true)).toBe(true);
    expect(canViewTeamBudgetApplication('admin', false, false)).toBe(true);
    expect(canViewTeamBudgetApplication('team_lead', false, false)).toBe(false);
  });
});

describe('application year selection', () => {
  const setup = { academicYear: '2026-27', nextAcademicYear: '2027-28', setupState: 'upcoming' as const };

  it('uses the current year before next-year setup opens', () => {
    expect(selectTeamApplicationYear(setup, undefined)).toBe('2026-27');
    expect(selectTeamApplicationYear(setup, '2027-28')).toBe('2026-27');
  });

  it('defaults to the next year during setup while retaining access to the current year', () => {
    const open = { ...setup, setupState: 'open' as const };
    expect(selectTeamApplicationYear(open, undefined)).toBe('2027-28');
    expect(selectTeamApplicationYear(open, '2026-27')).toBe('2026-27');
  });

  it('keeps next-year applications available while manual rollover is pending', () => {
    expect(selectTeamApplicationYear({ ...setup, setupState: 'closed' }, undefined)).toBe('2027-28');
  });
});

describe('team budget application limits', () => {
  const caps = { ...emptyBudgetCaps(), equipment: 1_000_00 };

  it('allows a request at the cap', () => {
    expect(getSubmissionError([equipment(1_000_00)], caps)).toBeNull();
  });

  it('warns but allows a request exactly 10% over the cap', () => {
    const items = [equipment(550_00), equipment(550_00, 2)];
    expect(getCategoryRequest(items, 'equipment', caps)).toMatchObject({
      overCap: true,
      overLimit: false,
      maxCents: 1_100_00
    });
    expect(getSubmissionError(items, caps)).toBeNull();
  });

  it('blocks a request one cent past the 10% ceiling', () => {
    const items = [equipment(550_01), equipment(550_00, 2)];
    expect(getCategoryRequest(items, 'equipment', caps).overLimit).toBe(true);
    expect(getSubmissionError(items, caps)).toContain('exceeds its category cap');
    expect(getSubmissionError(items, caps)).not.toContain('10%');
    expect(getSubmissionError(items, caps)).not.toContain('$1,100.00');
  });

  it('blocks any positive request against a zero cap', () => {
    expect(getSubmissionError([equipment(100_00)], emptyBudgetCaps())).toContain('exceeds its category cap');
  });

  it('keeps the 10% allowance at exactly $10,000 in total plan funding', () => {
    const teamCaps = { ...emptyBudgetCaps(), equipment: 9_000_00, food: 1_000_00 };
    const items = Array.from({ length: 10 }, (_, index) => equipment(990_00, index + 1));
    expect(getCategoryRequest(items, 'equipment', teamCaps)).toMatchObject({
      overCap: true,
      overLimit: false,
      maxCents: 9_900_00
    });
    expect(getSubmissionError(items, teamCaps)).toBeNull();
  });

  it('blocks any category overage when total plan funding exceeds $10,000', () => {
    const teamCaps = { ...emptyBudgetCaps(), equipment: 8_000_00, food: 2_000_01 };
    const items = [equipment(8_000_01)];
    expect(getCategoryRequest(items, 'equipment', teamCaps)).toMatchObject({
      overCap: true,
      overLimit: true,
      maxCents: 8_000_00
    });
    expect(getSubmissionError(items, teamCaps)).toContain('Equipment exceeds its category cap');
  });

  it('requires an average of at least one equipment line per $1,000 for smaller teams', () => {
    const wideCaps = { ...caps, equipment: 3_000_00 };
    expect(getSubmissionError([equipment(2_001_00)], wideCaps)).toContain('2 more line items');
    expect(getSubmissionError([equipment(1_000_00), equipment(1_000_00, 2), equipment(1_00, 3)], wideCaps)).toBeNull();
  });

  it('uses one equipment line per $1,500 when total team funding exceeds $10,000', () => {
    const largeCaps = { ...emptyBudgetCaps(), equipment: 10_000_01 };
    const threeLines = [equipment(1_500_00), equipment(1_500_00, 2), equipment(1_500_00, 3)];
    expect(getCategoryRequest(threeLines, 'equipment', largeCaps)).toMatchObject({
      lineItemTargetCents: 1_500_00,
      requiredItemCount: 3,
      missingItems: 0
    });
    expect(getSubmissionError(threeLines, largeCaps)).toBeNull();
    expect(getSubmissionError([equipment(1_500_01)], largeCaps)).toContain('1 more line item');
    expect(getSubmissionError([equipment(1_500_01)], largeCaps)).toContain('$1,500.00');
  });

  it('does not impose a line-count minimum on non-equipment categories', () => {
    const otherCaps = { ...emptyBudgetCaps(), food: 4_000_00, travel: 4_000_00 };
    const items: BudgetApplicationItem[] = [
      { id: 'food-1', category: 'food', description: 'Team meals', amountCents: 4_000_00 },
      { id: 'travel-1', category: 'travel', description: 'Competition travel', amountCents: 4_000_00 }
    ];
    expect(getCategoryRequest(items, 'food', otherCaps).missingItems).toBe(0);
    expect(getCategoryRequest(items, 'travel', otherCaps).missingItems).toBe(0);
    expect(getSubmissionError(items, otherCaps)).toBeNull();
  });

  it('rejects an empty submission', () => {
    expect(getSubmissionError([], caps)).toContain('at least one line item');
  });

  it('rejects forged categories, negative amounts, and duplicate ids', () => {
    expect(() => normalizeApplicationItems([{ ...equipment(100_00), category: 'travel_extra' }])).toThrow();
    expect(() => normalizeApplicationItems([equipment(-1)])).toThrow();
    expect(() => normalizeApplicationItems([equipment(100_00), equipment(100_00)])).toThrow();
  });
});
