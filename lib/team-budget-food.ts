import type { BudgetApplicationItem } from '@/lib/team-budget-application-rules';

const FOOD_QUARTERS = [
  { id: 'prefill-food-fall', label: 'Fall' },
  { id: 'prefill-food-winter', label: 'Winter' },
  { id: 'prefill-food-spring', label: 'Spring' }
] as const;

export function getAnnualFoodBudgetCents(perMemberCents: number, memberCount: number) {
  if (!Number.isSafeInteger(perMemberCents) || perMemberCents < 0 ||
      !Number.isSafeInteger(memberCount) || memberCount < 0) {
    throw new Error('Enter a valid annual food rate and member count.');
  }
  const total = perMemberCents * memberCount;
  if (!Number.isSafeInteger(total)) throw new Error('Annual food total is too large.');
  return total;
}

export function getFoodQuarterItems(foodCapCents: number): BudgetApplicationItem[] {
  if (!Number.isSafeInteger(foodCapCents) || foodCapCents < 3) return [];
  const base = Math.floor(foodCapCents / FOOD_QUARTERS.length);
  const remainder = foodCapCents % FOOD_QUARTERS.length;
  return FOOD_QUARTERS.map((quarter, index) => ({
    id: `${quarter.id}-${foodCapCents}`,
    category: 'food',
    description: `Meeting Food - ${quarter.label} Quarter`,
    amountCents: base + (index < remainder ? 1 : 0)
  }));
}

export function withFoodQuarterItems(items: BudgetApplicationItem[], foodCapCents: number) {
  if (hasFixedFoodQuarterItems(items, foodCapCents)) return items;
  return [...items.filter((item) => item.category !== 'food'), ...getFoodQuarterItems(foodCapCents)];
}

export function hasFixedFoodQuarterItems(items: BudgetApplicationItem[], foodCapCents: number) {
  const expected = getFoodQuarterItems(foodCapCents);
  const food = items.filter((item) => item.category === 'food');
  return food.length === expected.length && food.every((item, index) =>
    item.id === expected[index].id &&
    item.description === expected[index].description &&
    item.amountCents === expected[index].amountCents
  );
}

export function assertFixedFoodQuarterItems(items: BudgetApplicationItem[], foodCapCents: number) {
  if (!hasFixedFoodQuarterItems(items, foodCapCents)) {
    throw new Error('Food quarters are fixed by the club budget plan. Refresh to see the approved amounts.');
  }
}
