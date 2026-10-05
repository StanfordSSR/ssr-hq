import { describe, expect, it } from 'vitest';
import {
  assertFixedFoodQuarterItems,
  getAnnualFoodBudgetCents,
  getFoodQuarterItems,
  hasFixedFoodQuarterItems,
  withFoodQuarterItems
} from '@/lib/team-budget-food';
import { normalizeApplicationItems, type BudgetApplicationItem } from '@/lib/team-budget-application-rules';

describe('team food budget prefill', () => {
  it('splits yearly food cents across fall, winter, and spring without losing a cent', () => {
    const items = getFoodQuarterItems(1_050_01);
    expect(items.map((item) => item.description)).toEqual([
      'Meeting Food - Fall Quarter',
      'Meeting Food - Winter Quarter',
      'Meeting Food - Spring Quarter'
    ]);
    expect(items.map((item) => item.amountCents)).toEqual([35_001, 35_000, 35_000]);
    expect(items.reduce((sum, item) => sum + item.amountCents, 0)).toBe(1_050_01);
    expect(normalizeApplicationItems(items)).toEqual(items);
  });

  it('replaces custom food rows but preserves every other category', () => {
    const equipment: BudgetApplicationItem = { id: 'equipment-1', category: 'equipment', description: 'Parts', amountCents: 100_00 };
    const existingFood: BudgetApplicationItem = { id: 'food-1', category: 'food', description: 'Team dinner', amountCents: 200_00 };
    expect(withFoodQuarterItems([equipment], 300_00)).toEqual([equipment, ...getFoodQuarterItems(300_00)]);
    expect(withFoodQuarterItems([equipment, existingFood], 300_00)).toEqual([equipment, ...getFoodQuarterItems(300_00)]);
    expect(withFoodQuarterItems([equipment], 0)).toEqual([equipment]);
    expect(withFoodQuarterItems([equipment, existingFood], 0)).toEqual([equipment]);
  });

  it('reconciles legacy quarter rows to the current cap without touching other draft lines', () => {
    const equipment: BudgetApplicationItem = { id: 'equipment-1', category: 'equipment', description: 'Parts', amountCents: 100_00 };
    const oldFood = getFoodQuarterItems(1_050_00).map((item, index) => ({ ...item, id: `old-food-${index}` }));
    expect(withFoodQuarterItems([equipment, ...oldFood], 936_00)).toEqual([equipment, ...getFoodQuarterItems(936_00)]);
  });

  it('refreshes fixed rows whenever the plan cap changes', () => {
    const original = getFoodQuarterItems(936_00);
    expect(withFoodQuarterItems(original, 900_00)).toEqual(getFoodQuarterItems(900_00));
    expect(withFoodQuarterItems(original, 936_00)).toBe(original);
    expect(withFoodQuarterItems(original, 0)).toEqual([]);
    const edited = [{ ...original[0], description: 'Fall kickoff food' }, ...original.slice(1)];
    expect(withFoodQuarterItems(edited, 900_00)).toEqual(getFoodQuarterItems(900_00));
  });

  it('rejects changed, missing, reordered, or extra food rows on save', () => {
    const canonical = getFoodQuarterItems(936_00);
    expect(hasFixedFoodQuarterItems(canonical, 936_00)).toBe(true);
    expect(() => assertFixedFoodQuarterItems(canonical, 936_00)).not.toThrow();
    for (const changed of [
      canonical.slice(1),
      [canonical[1], canonical[0], canonical[2]],
      [{ ...canonical[0], amountCents: 311_00 }, ...canonical.slice(1)],
      [{ ...canonical[0], description: 'Custom food' }, ...canonical.slice(1)],
      [...canonical, { id: 'extra-food', category: 'food' as const, description: 'Extra', amountCents: 1_00 }]
    ]) {
      expect(() => assertFixedFoodQuarterItems(changed, 936_00)).toThrow(/fixed by the club budget plan/);
    }
    expect(() => assertFixedFoodQuarterItems(canonical, 900_00)).toThrow(/Refresh/);
    expect(() => assertFixedFoodQuarterItems([], 0)).not.toThrow();
  });

  it('uses an annual per-member rate without multiplying by quarters', () => {
    expect(getAnnualFoodBudgetCents(25_00, 14)).toBe(350_00);
    expect(() => getAnnualFoodBudgetCents(-1, 14)).toThrow();
    expect(() => getAnnualFoodBudgetCents(25_00, -1)).toThrow();
  });
});
