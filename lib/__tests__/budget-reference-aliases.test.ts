import { describe, expect, it } from 'vitest';
import { buildBudgetReferenceAliases, remapBudgetReferences } from '@/lib/budget-reference-aliases';

const expenses = [
  { id: 'old-leadership', plan_id: 'old', kind: 'operations', team_id: null, parent_id: null, category: null, label: 'Leadership Operations' },
  { id: 'old-equipment', plan_id: 'old', kind: 'operations', team_id: null, parent_id: 'old-leadership', category: 'equipment', label: 'Equipment' },
  { id: 'old-mixer', plan_id: 'old', kind: 'event', team_id: null, parent_id: null, category: null, label: 'Fall Mixer' },
  { id: 'old-mixer-food', plan_id: 'old', kind: 'event', team_id: null, parent_id: 'old-mixer', category: 'food', label: 'Food' },
  { id: 'old-team', plan_id: 'old', kind: 'team', team_id: 'sky', parent_id: null, category: 'equipment', label: 'SkyRunners — Equipment' },
  { id: 'new-leadership', plan_id: 'new', kind: 'operations', team_id: null, parent_id: null, category: null, label: 'Leadership Operations' },
  { id: 'new-equipment', plan_id: 'new', kind: 'operations', team_id: null, parent_id: 'new-leadership', category: 'equipment', label: 'Equipment' },
  { id: 'new-mixer', plan_id: 'new', kind: 'event', team_id: null, parent_id: null, category: null, label: 'Fall Mixer' },
  { id: 'new-mixer-food', plan_id: 'new', kind: 'event', team_id: null, parent_id: 'new-mixer', category: 'food', label: 'Food' },
  { id: 'new-team', plan_id: 'new', kind: 'team', team_id: 'sky', parent_id: null, category: 'equipment', label: 'SkyRunners — Equipment' }
];

const sources = [
  { id: 'old-grant', plan_id: 'old', kind: 'annual_grant', category: 'food', label: 'Annual grant' },
  { id: 'new-grant', plan_id: 'new', kind: 'annual_grant', category: 'food', label: 'Annual grant' }
];

describe('budget reference aliases', () => {
  it('attributes old purchases and pending reimbursements to matching current accounts without changing the originals', () => {
    const aliases = buildBudgetReferenceAliases('new', expenses, sources);
    const previous = [{ budget_expense_item_id: 'old-mixer-food', funding_source_id: 'old-grant', amount_cents: 32722 }];
    const mapped = remapBudgetReferences(previous, aliases);

    expect(mapped).toEqual([{ budget_expense_item_id: 'new-mixer-food', funding_source_id: 'new-grant', amount_cents: 32722 }]);
    expect(previous[0].budget_expense_item_id).toBe('old-mixer-food');
    expect(aliases.expenseIds.get('old-team')).toBe('new-team');
  });

  it('does not guess when the active plan has duplicate matching accounts', () => {
    const duplicate = { ...expenses[6], id: 'duplicate-equipment' };
    const aliases = buildBudgetReferenceAliases('new', [...expenses, duplicate], sources);
    expect(aliases.expenseIds.has('old-equipment')).toBe(false);
    expect(aliases.expenseIds.get('old-mixer-food')).toBe('new-mixer-food');
  });
});
