import { describe, it, expect } from 'vitest';
import { summerRemainingCents, annualRemainingCents } from '@/lib/team-expense-notify';

describe('summerRemainingCents', () => {
  it('subtracts prior summer spend and the just-logged item from the predicted spend', () => {
    // Planned $1000, already spent $300 this summer, just logged $50 → $650 left.
    expect(summerRemainingCents(100000, 30000, 5000)).toBe(65000);
  });

  it('can go negative when the team has overspent its summer plan', () => {
    expect(summerRemainingCents(20000, 18000, 5000)).toBe(-3000);
  });

  it('with no prior summer spend, just subtracts the logged item', () => {
    expect(summerRemainingCents(50000, 0, 12500)).toBe(37500);
  });
});

describe('annualRemainingCents', () => {
  it('is the annual budget minus funds spent this year', () => {
    expect(annualRemainingCents(500000, 320000)).toBe(180000);
  });

  it('can go negative when over budget', () => {
    expect(annualRemainingCents(100000, 130000)).toBe(-30000);
  });
});
