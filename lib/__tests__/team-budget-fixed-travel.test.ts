import { describe, expect, it } from 'vitest';
import {
  FIXED_TRAVEL_ZERO_IDS,
  assertFixedTravelItems,
  getFixedTravelItems,
  hasFixedTravelItems,
  withFixedTravelItems
} from '@/lib/team-budget-fixed-travel';
import {
  emptyBudgetCaps,
  getCategoryRequest,
  getSubmissionError,
  normalizeApplicationItems,
  type BudgetApplicationItem
} from '@/lib/team-budget-application-rules';

const year = '2026-27';

describe('fixed team travel allocations', () => {
  it.each([
    ['robosub', 4_365_00, 5],
    ['skyrunners', 4_515_00, 6],
    ['combat-robotics', 1_000_00, 1]
  ])('%s matches the travel cap and retains every approved line', (slug, capCents, count) => {
    const items = getFixedTravelItems(slug, year);
    expect(items).toHaveLength(count);
    expect(items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(capCents);
    expect(items.every((item) => item.description.length <= 160)).toBe(true);
    expect(items.every((item) => item.category === 'travel')).toBe(true);
    const caps = { ...emptyBudgetCaps(), travel: capCents };
    expect(getCategoryRequest(items, 'travel', caps).missingItems).toBe(0);
    expect(getSubmissionError(items, caps)).toBeNull();
    expect(() => assertFixedTravelItems(items, items, capCents)).not.toThrow();
  });

  it('keeps non-travel draft entries while replacing any old travel entries', () => {
    const equipment: BudgetApplicationItem = {
      id: 'existing-equipment', category: 'equipment', description: 'Materials', amountCents: 300_00
    };
    const oldTravel: BudgetApplicationItem = {
      id: 'old-travel', category: 'travel', description: 'Old request', amountCents: 50_00
    };
    const fixed = getFixedTravelItems('skyrunners', year);
    expect(hasFixedTravelItems([equipment, oldTravel], fixed)).toBe(false);
    expect(withFixedTravelItems([equipment, oldTravel], fixed)).toEqual([equipment, ...fixed]);
    expect(hasFixedTravelItems([equipment, ...fixed], fixed)).toBe(true);
    expect(withFixedTravelItems([equipment, ...fixed], fixed)).toEqual([equipment, ...fixed]);
  });

  it('accepts only the approved zero-dollar references and rejects tampering', () => {
    const fixed = getFixedTravelItems('robosub', year);
    expect(normalizeApplicationItems(fixed, FIXED_TRAVEL_ZERO_IDS)).toEqual(fixed);
    expect(() => normalizeApplicationItems(fixed)).toThrow();
    expect(() => assertFixedTravelItems(fixed.slice(1), fixed, 4_365_00)).toThrow(/fixed by the club/);
    expect(() => assertFixedTravelItems([{ ...fixed[0], amountCents: 66_00 }, ...fixed.slice(1)], fixed, 4_365_00)).toThrow(/fixed by the club/);
    expect(() => assertFixedTravelItems(fixed, fixed, 4_366_00)).toThrow(/no longer match/);
  });

  it('does not prefill or lock other teams or future years', () => {
    expect(getFixedTravelItems('builderbot', year)).toEqual([]);
    expect(getFixedTravelItems('robosub', '2027-28')).toEqual([]);
    const ordinary: BudgetApplicationItem[] = [{ id: 'travel-1', category: 'travel', description: 'Trip', amountCents: 100_00 }];
    expect(withFixedTravelItems(ordinary, [])).toEqual(ordinary);
    expect(() => assertFixedTravelItems(ordinary, [], 100_00)).not.toThrow();
  });
});
