import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import {
  finalizeReimbursementDecision,
  getActivePresidentReviewers,
  getReimbursementReviewers,
  getReimbursementByToken,
  verifyReimbursementSignature
} from '@/lib/reimbursements';

export const runtime = 'nodejs';

// Backs the tokenized Slack approval link. The token alone authorizes the
// decision (it was DM'd to the lead). Above-threshold approvals additionally
// require a drawn signature that matches an enrolled team lead.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string; decision?: 'approved' | 'rejected'; strokes?: unknown }
    | null;

  const token = body?.token?.trim();
  const decision = body?.decision;
  if (!token || (decision !== 'approved' && decision !== 'rejected')) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const reimbursement = await getReimbursementByToken(token);
  if (!reimbursement) {
    return NextResponse.json({ error: 'This approval link is not valid.' }, { status: 404 });
  }
  if (reimbursement.status !== 'pending') {
    return NextResponse.json(
      { error: `This reimbursement was already ${reimbursement.status}.`, status: reimbursement.status },
      { status: 409 }
    );
  }

  let presidentId: string | null = null;
  if (reimbursement.expense_type === 'leadership') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const presidents = await getActivePresidentReviewers();
    if (!user || !presidents.some((president) => president.userId === user.id)) {
      return NextResponse.json({ error: 'Sign in as a club president to review this reimbursement.' }, { status: 403 });
    }
    presidentId = user.id;
  }

  try {
    if (decision === 'rejected') {
      await finalizeReimbursementDecision({
        reimbursement,
        decision: 'rejected',
        deciderProfileId: presidentId,
        approvalKind: reimbursement.requires_signature ? 'signature' : 'button',
        source: 'token_link'
      });
      return NextResponse.json({ ok: true, status: 'rejected' });
    }

    if (reimbursement.requires_signature) {
      const verified = await verifyReimbursementSignature(reimbursement, body?.strokes);
      await finalizeReimbursementDecision({
        reimbursement,
        decision: 'approved',
        deciderProfileId: verified.leadUserId,
        approvalKind: 'signature',
        signatureScore: verified.score,
        signatureThreshold: verified.threshold,
        source: 'token_link_signature'
      });
      return NextResponse.json({ ok: true, status: 'approved', signed: true });
    }

    // Below threshold: a tap is enough. Attribute to the first active lead.
    const leads = await getReimbursementReviewers(reimbursement);
    await finalizeReimbursementDecision({
      reimbursement,
      decision: 'approved',
      deciderProfileId: presidentId ?? leads[0]?.userId ?? null,
      approvalKind: 'button',
      source: 'token_link'
    });
    return NextResponse.json({ ok: true, status: 'approved' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record the decision.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
