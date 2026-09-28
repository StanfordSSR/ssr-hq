import { describe, expect, it } from 'vitest';
import { selectBudgetPlanYear } from '@/lib/budget-plan';

describe('budget plan year selection', () => {
  const setup = {
    academicYear: '2026-27',
    nextAcademicYear: '2027-28',
    setupState: 'upcoming' as const
  };

  it('shows the active-year plan after rollover', () => {
    expect(selectBudgetPlanYear(setup, undefined)).toBe('2026-27');
  });

  it('keeps the current plan accessible while next-year setup is open', () => {
    expect(selectBudgetPlanYear({ ...setup, setupState: 'open' }, '2026-27')).toBe('2026-27');
    expect(selectBudgetPlanYear({ ...setup, setupState: 'open' }, undefined)).toBe('2027-28');
  });

  it('can show the prior year without accepting arbitrary years', () => {
    expect(selectBudgetPlanYear(setup, '2025-26')).toBe('2025-26');
    expect(selectBudgetPlanYear(setup, '2030-31')).toBe('2026-27');
    expect(selectBudgetPlanYear(setup, ['2027-28'])).toBe('2026-27');
  });
});
