import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import {
  finalizeReimbursementDecision,
  getActiveTeamLeads,
  getReimbursementById
} from '@/lib/reimbursements';

// Slack bot callback for native Approve/Reject buttons on a reimbursement push.
// The bot identifies the lead who tapped (by email or Slack user id); we confirm
// they are an active lead of the reimbursement's team before recording it.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.slackbotNotifySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        reimbursement_id?: string;
        decision?: 'approved' | 'rejected';
        approver_email?: string;
        approver_slack_user_id?: string;
      }
    | null;

  const reimbursementId = body?.reimbursement_id?.trim();
  const decision = body?.decision;
  const approverEmail = body?.approver_email?.trim().toLowerCase();
  const approverSlackUserId = body?.approver_slack_user_id?.trim();

  if (!reimbursementId || (decision !== 'approved' && decision !== 'rejected')) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const reimbursement = await getReimbursementById(reimbursementId);
  if (!reimbursement) {
    return NextResponse.json({ error: 'Reimbursement not found.' }, { status: 404 });
  }
  if (reimbursement.status !== 'pending') {
    return NextResponse.json(
      { ok: true, note: `Already ${reimbursement.status}.`, status: reimbursement.status },
      { status: 200 }
    );
  }

  // Above-threshold reimbursements can't be settled with a button tap.
  if (reimbursement.requires_signature && decision === 'approved') {
    return NextResponse.json(
      {
        error:
          'This reimbursement is over the signature threshold. Approve it from the signed link instead.',
        approve_url: `${env.siteUrl}/approve-reimbursement/${reimbursement.decision_token}`
      },
      { status: 422 }
    );
  }

  // Resolve the approver to a profile and confirm they lead this team.
  const admin = createAdminClient();
  let approverProfileId: string | null = null;
  if (approverEmail) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('email', approverEmail)
      .eq('active', true)
      .maybeSingle();
    approverProfileId = data?.id ?? null;
  } else if (approverSlackUserId) {
    const { data } = await admin
      .from('profiles')
      .select('id')
      .eq('slack_user_id', approverSlackUserId)
      .eq('active', true)
      .maybeSingle();
    approverProfileId = data?.id ?? null;
  }

  if (!approverProfileId) {
    return NextResponse.json({ error: 'Approver is not a recognized active user.' }, { status: 403 });
  }

  const leads = await getActiveTeamLeads(reimbursement.team_id);
  if (!leads.some((lead) => lead.userId === approverProfileId)) {
    return NextResponse.json(
      { error: 'Only an active lead of this team can approve its reimbursements.' },
      { status: 403 }
    );
  }

  try {
    await finalizeReimbursementDecision({
      reimbursement,
      decision,
      deciderProfileId: approverProfileId,
      approvalKind: 'button',
      source: 'slack_button'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record the decision.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, status: decision });
}
