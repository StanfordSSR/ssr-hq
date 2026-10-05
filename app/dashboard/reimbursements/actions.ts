'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext, profileHasPresidentRole } from '@/lib/auth';
import { recordAuditEvent } from '@/lib/audit';
import {
  getReimbursementById,
  getReimbursementReviewers,
  sendReimbursementSlackPush,
  finalizeReimbursementDecision,
  canFileInGranted,
  type ReimbursementRow
} from '@/lib/reimbursements';
import { getLeadTeamIds } from '@/lib/lead-state';

type ActionResult = { ok: boolean; message: string };

export async function retryReimbursementNotificationAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user, profile, currentRole } = await getViewerContext();
  const id = String(formData.get('reimbursement_id') || '').trim();
  const reimbursement = id ? await getReimbursementById(id) : null;
  if (!reimbursement || reimbursement.status !== 'pending') {
    return { ok: false, message: 'This reimbursement is no longer awaiting review.' };
  }

  const isFinance = currentRole === 'admin' || currentRole === 'president' || currentRole === 'financial_officer';
  const leadTeams = await getLeadTeamIds(user.id);
  const canRetry = isFinance || (reimbursement.expense_type === 'leadership'
    ? profileHasPresidentRole(profile)
    : Boolean(reimbursement.team_id && leadTeams.includes(reimbursement.team_id)));
  if (!canRetry) return { ok: false, message: 'You cannot retry this notification.' };

  if (!['partial', 'failed', 'unknown', 'pending'].includes(reimbursement.slack_delivery_status)) {
    return { ok: false, message: 'This notification is already delivered or was not tracked.' };
  }
  if (reimbursement.slack_delivery_status === 'pending' && reimbursement.slack_delivery_requested_at &&
      Date.now() - Date.parse(reimbursement.slack_delivery_requested_at) < 60_000) {
    return { ok: false, message: 'The bot is still processing this notification.' };
  }

  const admin = createAdminClient();
  let claim = admin.from('member_reimbursements')
    .update({ slack_delivery_status: 'pending', slack_delivery_requested_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .eq('slack_delivery_status', reimbursement.slack_delivery_status)
    .eq('slack_delivery_attempts', reimbursement.slack_delivery_attempts);
  if (reimbursement.slack_delivery_status === 'pending') {
    claim = claim.lt('slack_delivery_requested_at', new Date(Date.now() - 60_000).toISOString());
  }
  const { data: claimed, error: claimError } = await claim.select('*').maybeSingle();
  if (claimError) return { ok: false, message: claimError.message };
  if (!claimed) return { ok: false, message: 'Another retry is already in progress.' };

  try {
    const reviewers = await getReimbursementReviewers(reimbursement);
    let teamName = 'SSR Club / Leadership';
    if (reimbursement.team_id) {
      const { data: team } = await admin.from('teams').select('name').eq('id', reimbursement.team_id).single();
      teamName = team?.name || 'Team';
    }
    const status = await sendReimbursementSlackPush(claimed as ReimbursementRow, reviewers, teamName);
    await recordAuditEvent({
      actorId: user.id,
      action: 'reimbursement.slack_delivery_retried',
      targetType: 'member_reimbursement',
      targetId: id,
      summary: `Checked or retried Slack delivery for ${reimbursement.reimbursement_number}: ${status}.`
    });
    revalidatePath('/dashboard/reimbursements');
    return {
      ok: status === 'delivered',
      message: status === 'delivered' ? 'Reviewer notification confirmed.'
        : status === 'unknown' ? 'Delivery is still unconfirmed. Check again later.'
        : 'Some reviewer DMs failed. You can retry again.'
    };
  } catch (error) {
    revalidatePath('/dashboard/reimbursements');
    return { ok: false, message: error instanceof Error ? error.message : 'Could not check delivery.' };
  }
}

// Financial officers mark an approved reimbursement as filed in the Stanford
// Granted portal so it drops off the to-do list. See canFileInGranted for who
// is allowed and why.
export async function setReimbursementProcessedAction(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { user, currentRole } = await getViewerContext();
  if (!canFileInGranted(currentRole)) {
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
  const { user, profile } = await getViewerContext();
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
  if (reimbursement.expense_type === 'leadership') {
    if (!profileHasPresidentRole(profile)) {
      return { ok: false, message: 'Only a club president can approve leadership reimbursements.' };
    }
  } else {
    const myLeadTeams = await getLeadTeamIds(user.id);
    if (!reimbursement.team_id || !myLeadTeams.includes(reimbursement.team_id)) {
      return { ok: false, message: 'Only a team lead of this team can approve its reimbursements.' };
    }
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
