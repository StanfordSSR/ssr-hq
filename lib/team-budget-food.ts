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
  const prefill = getFoodQuarterItems(foodCapCents);
  const food = items.filter((item) => item.category === 'food');
  const legacyQuarterRows = food.length === prefill.length &&
    prefill.every((item) => food.some((existing) => existing.description === item.description)) &&
    food.every((item) => !item.id.startsWith('prefill-food-'));
  const originalCap = Number(food[0]?.id.match(/^prefill-food-fall-(\d+)$/)?.[1]);
  const originalPrefill = Number.isSafeInteger(originalCap) ? getFoodQuarterItems(originalCap) : [];
  const untouchedPrefill = food.length === originalPrefill.length && originalPrefill.every((expected, index) => {
    const item = food[index];
    return item.id === expected.id && item.description === expected.description && item.amountCents === expected.amountCents;
  });
  if (prefill.length === 0) return untouchedPrefill && food.length > 0 ? items.filter((item) => item.category !== 'food') : items;
  if (untouchedPrefill && originalCap === foodCapCents) return items;
  if (food.length > 0 && !legacyQuarterRows && !untouchedPrefill) return items;
  return [...items.filter((item) => item.category !== 'food'), ...prefill];
}
