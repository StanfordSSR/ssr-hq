'use server';

import { revalidatePath } from 'next/cache';
import { getViewerContext } from '@/lib/auth';
import { getBudgetSetupState } from '@/lib/budget-plan';
import { getLeadTeamIds } from '@/lib/lead-state';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import {
  getSubmissionError,
  isTeamBudgetApplicationClosed,
  normalizeApplicationItems,
  type BudgetApplicationItem
} from '@/lib/team-budget-application-rules';
import { getTeamBudgetCaps } from '@/lib/team-budget-application';

type SaveApplicationInput = {
  teamId: string;
  academicYear: string;
  expectedVersion: number;
  intent: 'draft' | 'submit';
  items: BudgetApplicationItem[];
};

type SaveApplicationResult =
  | { ok: true; version: number; status: 'draft' | 'submitted'; updatedAt: string }
  | { ok: false; error: string; code?: 'conflict' };

const conflictError = 'Another lead saved a newer draft. Your entries are still here; load the latest draft before editing further.';

export async function saveTeamBudgetApplicationAction(input: SaveApplicationInput): Promise<SaveApplicationResult> {
  const { user } = await getViewerContext();
  if (!input || typeof input.teamId !== 'string' || typeof input.academicYear !== 'string') {
    return { ok: false, error: 'Invalid application request.' };
  }
  if (isTeamBudgetApplicationClosed(input.academicYear)) return { ok: false, error: 'The annual budget application deadline has passed.' };
  const leadTeamIds = await getLeadTeamIds(user.id);
  if (!leadTeamIds.includes(input.teamId)) return { ok: false, error: 'Only an active team lead can edit this application.' };

  try {
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new Error('Refresh the application and try again.');
    }
    if (input.intent !== 'draft' && input.intent !== 'submit') {
      throw new Error('Invalid application action.');
    }

    const items = normalizeApplicationItems(input.items);
    const setup = await getBudgetSetupState();
    const academicYear = input.academicYear;
    if (
      academicYear !== setup.academicYear &&
      !(academicYear === setup.nextAcademicYear && setup.setupState !== 'upcoming')
    ) {
      throw new Error('This academic year is not open for applications.');
    }
    const { plan, caps } = await getTeamBudgetCaps(input.teamId, academicYear);
    if (!plan) throw new Error(`The ${academicYear} budget plan is not available yet.`);
    if (input.intent === 'submit') {
      const submissionError = getSubmissionError(items, caps);
      if (submissionError) throw new Error(submissionError);
    }

    const admin = createAdminClient();
    const { data: team, error: teamError } = await admin
      .from('teams')
      .select('id, name')
      .eq('id', input.teamId)
      .eq('is_active', true)
      .maybeSingle();
    if (teamError || !team) throw new Error('This team is no longer active.');

    const { data: existing, error: existingError } = await admin
      .from('team_budget_applications')
      .select('id, version, status')
      .eq('team_id', input.teamId)
      .eq('academic_year', academicYear)
      .maybeSingle();
    if (existingError) throw new Error('Could not load the current application.');
    if (existing?.status === 'submitted') {
      return { ok: false, error: 'A co-lead submitted this application. Load the latest version to see it.', code: 'conflict' };
    }
    if ((existing?.version || 0) !== input.expectedVersion) {
      return { ok: false, error: conflictError, code: 'conflict' };
    }

    const submitted = input.intent === 'submit';
    const now = new Date().toISOString();
    const changes = {
      plan_id: plan.id,
      status: submitted ? 'submitted' : 'draft',
      line_items: items,
      updated_at: now,
      updated_by: user.id,
      submitted_at: submitted ? now : null,
      submitted_by: submitted ? user.id : null
    };
    let applicationId: string;

    if (existing) {
      const { data, error } = await admin
        .from('team_budget_applications')
        .update({ ...changes, version: existing.version + 1 })
        .eq('id', existing.id)
        .eq('version', existing.version)
        .eq('status', 'draft')
        .select('version')
        .maybeSingle();
      if (error) throw new Error('Could not save the application. Try again.');
      if (!data) return { ok: false, error: conflictError, code: 'conflict' };
      applicationId = existing.id;
    } else {
      const { data, error } = await admin
        .from('team_budget_applications')
        .insert({
          ...changes,
          team_id: input.teamId,
          academic_year: academicYear,
          version: 1
        })
        .select('id')
        .single();
      if (error?.code === '23505') return { ok: false, error: conflictError, code: 'conflict' };
      if (error || !data) throw new Error('Could not create this application. Refresh and try again.');
      applicationId = data.id;
    }

    await recordAuditEvent({
      actorId: user.id,
      action: submitted ? 'team_budget_application.submitted' : 'team_budget_application.saved',
      targetType: 'team_budget_application',
      targetId: applicationId,
      summary: `${submitted ? 'Submitted' : 'Saved'} ${team.name}'s ${academicYear} budget application.`,
      details: { teamId: input.teamId, academicYear, planId: plan.id, lineItemCount: items.length }
    });

    revalidatePath(`/dashboard/teams/${input.teamId}/budget-application`);
    revalidatePath(`/dashboard/teams/${input.teamId}`);
    revalidatePath('/dashboard/finances/applications');
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/tasks');
    return { ok: true, version: input.expectedVersion + 1, status: submitted ? 'submitted' : 'draft', updatedAt: now };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save the application.' };
  }
}
