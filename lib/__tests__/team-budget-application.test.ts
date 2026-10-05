import { describe, expect, it } from 'vitest';
import {
  canViewTeamBudgetApplication,
  emptyBudgetCaps,
  getCategoryRequest,
  getSubmissionError,
  isTeamBudgetApplicationOpen,
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

describe('timed application access', () => {
  const before = new Date('2026-10-05T02:19:59.999Z');
  const opens = new Date('2026-10-05T02:20:00.000Z');

  it('opens at 7:20 PM Pacific on October 4', () => {
    expect(isTeamBudgetApplicationOpen(before)).toBe(false);
    expect(isTeamBudgetApplicationOpen(opens)).toBe(true);
  });

  it('allows only the president to preview before opening', () => {
    expect(canViewTeamBudgetApplication('president', false, true, before)).toBe(true);
    expect(canViewTeamBudgetApplication('admin', false, true, before)).toBe(true);
    expect(canViewTeamBudgetApplication('team_lead', true, false, before)).toBe(false);
    expect(canViewTeamBudgetApplication('admin', false, false, before)).toBe(false);
  });

  it('allows every active lead and the reviewing officers at opening', () => {
    expect(canViewTeamBudgetApplication('team_lead', true, false, opens)).toBe(true);
    expect(canViewTeamBudgetApplication('president', false, true, opens)).toBe(true);
    expect(canViewTeamBudgetApplication('team_lead', false, false, opens)).toBe(false);
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
    expect(getSubmissionError(items, caps)).toContain('exceeds the 15% allowance');
  });

  it('blocks any positive request against a zero cap', () => {
    expect(getSubmissionError([equipment(100_00)], emptyBudgetCaps())).toContain('maximum is $0.00');
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
