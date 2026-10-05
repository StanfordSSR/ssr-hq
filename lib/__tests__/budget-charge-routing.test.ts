import { describe, expect, it } from 'vitest';
import { buildChargeCatalog, resolveCharge } from '@/lib/budget-charge-routing';

const expenses = [
  { id: 'sky-equipment', team_id: 'sky', kind: 'team', parent_id: null, category: 'equipment' as const, label: 'SkyRunners — Equipment', amount_cents: 2600000, sort_order: 1 },
  { id: 'sky-other', team_id: 'sky', kind: 'team', parent_id: null, category: 'other' as const, label: 'SkyRunners — Other', amount_cents: 500000, sort_order: 2 },
  { id: 'combat-equipment', team_id: 'combat', kind: 'team', parent_id: null, category: 'equipment' as const, label: 'Combat Robotics — Equipment', amount_cents: 600000, sort_order: 1 },
  { id: 'leadership', team_id: null, kind: 'operations', parent_id: null, category: null, label: 'Leadership Operations', amount_cents: 0, sort_order: 1 },
  { id: 'leadership-food', team_id: null, kind: 'operations', parent_id: 'leadership', category: 'food' as const, label: 'Food', amount_cents: 25000, sort_order: 2 }
];
const sources = [
  { id: 'grant-equipment', label: 'Annual Grant · Equipment', kind: 'annual_grant', category: 'equipment' as const, sort_order: 1 },
  { id: 'grant-other', label: 'Annual Grant · Other', kind: 'annual_grant', category: 'other' as const, sort_order: 2 },
  { id: 'hoover', label: 'Hoover', kind: 'grant', category: null, sort_order: 3 },
  { id: 'soe', label: 'SoE Grant', kind: 'grant', category: null, sort_order: 4 }
];
const allocations = [
  { expense_id: 'sky-other', source_id: 'hoover', amount_cents: 250000 },
  { expense_id: 'sky-other', source_id: 'soe', amount_cents: 250000 }
];

describe('budget charge routing', () => {
  const catalog = buildChargeCatalog('plan-2026', expenses, sources, allocations);

  it('offers only the categories in the selected team plan', () => {
    expect(catalog.teams.sky.map((account) => account.category)).toEqual(['equipment', 'other']);
    expect(catalog.teams.combat.map((account) => account.category)).toEqual(['equipment']);
  });

  it('uses the category annual grant for an implicit remainder', () => {
    expect(catalog.teams.sky[0].sources).toEqual([
      { id: 'grant-equipment', label: 'Annual Grant · Equipment', amountCents: 2600000 }
    ]);
    expect(resolveCharge(catalog, 'team', 'combat', 'combat-equipment', '').sourceId).toBe('grant-equipment');
  });

  it('requires an explicit selection when two sources fund the same category', () => {
    expect(catalog.teams.sky[1].sources.map((source) => source.label)).toEqual(['Hoover', 'SoE Grant']);
    expect(() => resolveCharge(catalog, 'team', 'sky', 'sky-other', '')).toThrow('Choose a funding source');
    expect(resolveCharge(catalog, 'team', 'sky', 'sky-other', 'soe').sourceId).toBe('soe');
  });

  it('rejects another team account or a forged source', () => {
    expect(() => resolveCharge(catalog, 'team', 'combat', 'sky-other', 'hoover')).toThrow('Choose a budget category');
    expect(() => resolveCharge(catalog, 'team', 'sky', 'sky-equipment', 'hoover')).toThrow('Choose a funding source');
  });

  it('routes club leadership separately from team categories', () => {
    const charge = resolveCharge(catalog, 'leadership', null, 'leadership-food', '');
    expect(charge.category).toBeNull();
    expect(charge.sourceId).toBe('grant-other');
    expect(charge.expenseLabel).toBe('Leadership Operations / Food');
    expect(() => resolveCharge(catalog, 'team', 'sky', 'leadership-food', '')).toThrow();
  });
});
