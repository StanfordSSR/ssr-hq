'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import { getReimbursementById, finalizeReimbursementDecision } from '@/lib/reimbursements';
import { getLeadTeamIds } from '@/lib/lead-state';

type ActionResult = { ok: boolean; message: string };

const FINANCE_ROLES = new Set(['admin', 'president', 'financial_officer']);

// Financial officers (and admins/presidents) mark an approved reimbursement as
// filed in the Stanford Granted portal so it drops off the to-do list.
export async function setReimbursementProcessedAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user, currentRole } = await getViewerContext();
  if (!FINANCE_ROLES.has(currentRole)) {
    return { ok: false, message: 'Only financial officers can update Granted status.' };
  }

  const id = String(formData.get('reimbursement_id') || '').trim();
  const processed = String(formData.get('processed') || 'true') === 'true';
  if (!id) {
    return { ok: false, message: 'Missing reimbursement.' };
  }

  const reimbursement = await getReimbursementById(id);
  if (!reimbursement) {
    return { ok: false, message: 'Reimbursement not found.' };
  }
  if (reimbursement.status !== 'approved') {
    return { ok: false, message: 'Only approved reimbursements can be filed in Granted.' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('member_reimbursements')
    .update({
      finance_processed_at: processed ? new Date().toISOString() : null,
      finance_processed_by: processed ? user.id : null
    })
    .eq('id', id);

  if (error) {
    return { ok: false, message: error.message };
  }

  await recordAuditEvent({
    actorId: user.id,
    action: processed ? 'reimbursement.granted_filed' : 'reimbursement.granted_unfiled',
    targetType: 'member_reimbursement',
    targetId: id,
    summary: `${processed ? 'Marked' : 'Unmarked'} ${reimbursement.reimbursement_number} as filed in Granted.`
  });

  revalidatePath('/dashboard/reimbursements');
  return { ok: true, message: processed ? 'Marked as filed in Granted.' : 'Reopened.' };
}

// A team lead approves/rejects a pending reimbursement for their own team from
// inside the portal. ONLY active leads of that team may decide — presidents,
// financial officers and admins cannot approve, they only file approved ones in
// Granted. Above the signature threshold this is blocked — those must be signed.
export async function decideReimbursementInPortalAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user } = await getViewerContext();
  const id = String(formData.get('reimbursement_id') || '').trim();
  const decision = String(formData.get('decision') || '') as 'approved' | 'rejected';
  if (!id || (decision !== 'approved' && decision !== 'rejected')) {
    return { ok: false, message: 'Invalid request.' };
  }

  const reimbursement = await getReimbursementById(id);
  if (!reimbursement) {
    return { ok: false, message: 'Reimbursement not found.' };
  }
  if (reimbursement.status !== 'pending') {
    return { ok: false, message: `Already ${reimbursement.status}.` };
  }

  // Only an active lead of this reimbursement's team can decide it.
  const myLeadTeams = await getLeadTeamIds(user.id);
  if (!myLeadTeams.includes(reimbursement.team_id)) {
    return { ok: false, message: 'Only a team lead of this team can approve its reimbursements.' };
  }

  if (reimbursement.requires_signature && decision === 'approved') {
    return {
      ok: false,
      message: 'This one is over the signature threshold — approve it from the signed Slack link.'
    };
  }

  try {
    await finalizeReimbursementDecision({
      reimbursement,
      decision,
      deciderProfileId: user.id,
      approvalKind: 'button',
      source: 'portal'
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not record decision.' };
  }

  revalidatePath('/dashboard/reimbursements');
  revalidatePath('/dashboard/expenses');
  return { ok: true, message: decision === 'approved' ? 'Approved and logged.' : 'Rejected.' };
}
