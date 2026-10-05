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

  it('warns but allows a request exactly 15% over the cap', () => {
    const items = [equipment(575_00), equipment(575_00, 2)];
    expect(getCategoryRequest(items, 'equipment', caps.equipment)).toMatchObject({
      overCap: true,
      overLimit: false,
      maxCents: 1_150_00
    });
    expect(getSubmissionError(items, caps)).toBeNull();
  });

  it('blocks a request one cent past the 15% ceiling', () => {
    const items = [equipment(575_01), equipment(575_00, 2)];
    expect(getCategoryRequest(items, 'equipment', caps.equipment).overLimit).toBe(true);
    expect(getSubmissionError(items, caps)).toContain('too far over its category cap');
    expect(getSubmissionError(items, caps)).not.toContain('15%');
    expect(getSubmissionError(items, caps)).not.toContain('$1,150.00');
  });

  it('blocks any positive request against a zero cap', () => {
    expect(getSubmissionError([equipment(100_00)], emptyBudgetCaps())).toContain('too far over its category cap');
  });

  it('requires an average of at least one line per $1,000 in each category', () => {
    const wideCaps = { ...caps, equipment: 3_000_00 };
    expect(getSubmissionError([equipment(2_001_00)], wideCaps)).toContain('2 more line items');
    expect(getSubmissionError([equipment(1_000_00), equipment(1_000_00, 2), equipment(1_00, 3)], wideCaps)).toBeNull();
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
