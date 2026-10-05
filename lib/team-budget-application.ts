import { createAdminClient } from '@/lib/supabase-admin';
import { getActiveBudgetPlan } from '@/lib/budget-plan';
import {
  emptyBudgetCaps,
  isBudgetCategory,
  normalizeApplicationItems,
  type BudgetApplicationItem
} from '@/lib/team-budget-application-rules';

export type TeamBudgetApplication = {
  id: string;
  teamId: string;
  academicYear: string;
  planId: string | null;
  status: 'draft' | 'submitted';
  items: BudgetApplicationItem[];
  version: number;
  updatedAt: string;
  submittedAt: string | null;
};

export async function getTeamBudgetCaps(teamId: string, academicYear: string) {
  const plan = await getActiveBudgetPlan(academicYear);
  const caps = emptyBudgetCaps();
  if (!plan) return { plan: null, caps };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('budget_expense_items')
    .select('category, amount_cents')
    .eq('plan_id', plan.id)
    .eq('kind', 'team')
    .eq('team_id', teamId)
    .is('parent_id', null);
  if (error) throw new Error('Could not load the team category caps.');

  for (const row of data || []) {
    if (isBudgetCategory(row.category)) caps[row.category] += row.amount_cents;
  }
  return { plan, caps };
}

export async function getTeamBudgetApplication(teamId: string, academicYear: string): Promise<TeamBudgetApplication | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('team_budget_applications')
    .select('id, team_id, academic_year, plan_id, status, line_items, version, updated_at, submitted_at')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear)
    .maybeSingle();
  if (error) throw new Error('Could not load the team budget application.');
  if (!data) return null;
  return {
    id: data.id,
    teamId: data.team_id,
    academicYear: data.academic_year,
    planId: data.plan_id,
    status: data.status,
    items: normalizeApplicationItems(data.line_items),
    version: data.version,
    updatedAt: data.updated_at,
    submittedAt: data.submitted_at
  };
}
