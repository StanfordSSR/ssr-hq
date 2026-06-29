import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import { env } from '@/lib/env';
import { getCreditCardApproverEmails } from '@/lib/credit-card';
import {
  sendSlackbotNotification,
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME
} from '@/lib/slackbot';

export const runtime = 'nodejs';

// Best-effort screenshot/capture report from the secure card view. The client
// fires this when it detects a PrintScreen / copy / tab-away while a value is
// revealed. NOTE: browser screenshot detection is inherently best-effort — it
// CANNOT be guaranteed (OS-level capture tools bypass the page entirely). The
// value here is the deterrent + the audit trail: any detected attempt is logged
// and reported to the Financial Officers / admins.
export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub as string | undefined;
  if (!sub) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: viewer } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', sub)
    .maybeSingle();
  const viewerName = viewer?.full_name || viewer?.email || 'A credit card viewer';
  const at = new Date().toISOString();

  await recordAuditEvent({
    actorId: sub,
    action: 'credit_card.screenshot_suspected',
    targetType: 'credit_card',
    targetId: '1',
    summary: `${viewerName} triggered a suspected screenshot of the shared card.`,
    details: { viewerName, viewerEmail: viewer?.email ?? null, at }
  });

  // Report to the Financial Officers / admins (best-effort, never blocks).
  try {
    const emails = await getCreditCardApproverEmails();
    if (emails.length > 0) {
      await sendSlackbotNotification({
        idempotency_key: `credit_card_screenshot:${sub}:${at}`,
        type: 'manual_message',
        team_id: SLACKBOT_SYSTEM_TEAM_ID,
        team_name: SLACKBOT_SYSTEM_TEAM_NAME,
        recipient_emails: emails,
        title: 'Possible credit card screenshot',
        message: `${viewerName} may have screenshotted or copied the shared credit card. This was logged automatically.`,
        cta_label: 'Open audit log',
        cta_url: `${env.siteUrl}/dashboard/settings`,
        metadata: { user_id: sub, at }
      });
    }
  } catch (error) {
    console.error('Credit card screenshot Slack push failed:', error);
  }

  return NextResponse.json({ ok: true });
}
