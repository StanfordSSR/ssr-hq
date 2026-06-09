import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';
import { recordAuditEvent } from '@/lib/audit';

// Slack bot callback for budget approve/reject buttons. Records a president's
// intent only — final sign-off still requires an in-portal drawn signature, so
// this endpoint never finalizes a plan or quarter declaration.
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.slackbotNotifySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        target_type?: 'plan' | 'quarter';
        target_id?: string;
        president_email?: string;
        decision?: 'approved' | 'rejected';
      }
    | null;

  const targetType = body?.target_type;
  const targetId = body?.target_id?.trim();
  const presidentEmail = body?.president_email?.trim().toLowerCase();
  const decision = body?.decision;

  if (!targetType || !targetId || !presidentEmail || !decision) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  if (targetType !== 'plan' && targetType !== 'quarter') {
    return NextResponse.json({ error: 'Invalid target_type.' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json({ error: 'Invalid decision.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, is_president')
    .eq('email', presidentEmail)
    .eq('active', true)
    .maybeSingle();

  if (!profile || !(profile.role === 'president' || profile.is_president)) {
    return NextResponse.json({ error: 'Not an active president.' }, { status: 403 });
  }

  const { error } = await admin.from('budget_approvals').upsert(
    {
      target_type: targetType,
      target_id: targetId,
      president_id: profile.id,
      president_email: presidentEmail,
      decision,
      signature: null,
      source: 'slack',
      decided_at: new Date().toISOString()
    },
    { onConflict: 'target_type,target_id,president_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAuditEvent({
    actorId: profile.id,
    action: 'budget.approval.slack_intent',
    targetType: targetType === 'plan' ? 'budget_plan' : 'budget_quarter_declaration',
    targetId,
    summary: `${presidentEmail} recorded a Slack ${decision} (signature still required in portal).`,
    details: { targetType, decision, source: 'slack' }
  });

  const { data: rows } = await admin
    .from('budget_approvals')
    .select('decision, signature')
    .eq('target_type', targetType)
    .eq('target_id', targetId);

  const approved = (rows || []).filter((row) => row.decision === 'approved').length;
  const rejected = (rows || []).filter((row) => row.decision === 'rejected').length;
  const signed = (rows || []).filter((row) => row.decision === 'approved' && row.signature).length;

  return NextResponse.json({
    ok: true,
    note: 'Intent recorded. Both presidents must add a drawn signature in the portal to finalize.',
    counts: { approved, rejected, signed, pending: Math.max(0, 2 - approved) }
  });
}
