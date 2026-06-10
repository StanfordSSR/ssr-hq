import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-admin';
import { env } from '@/lib/env';

// Read-only status poll for the Slack bot. Lets the bot learn the outcome of
// reimbursements decided OUTSIDE Slack (the tokenized sign link or the in-portal
// approve/reject), which produce no Slack interaction, so the bot can edit the
// leads' DMs to "Approved/Rejected by …" and drop the buttons.
//
//   GET /api/internal/reimbursement-status?id=<uuid>
//   GET /api/internal/reimbursement-status?ids=<uuid>,<uuid>,...
//   Authorization: Bearer <SSR_SLACKBOT_NOTIFY_SECRET>
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.slackbotNotifySecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const single = url.searchParams.get('id')?.trim();
  const many = url.searchParams.get('ids')?.trim();

  const ids = Array.from(
    new Set(
      [single, ...(many ? many.split(',') : [])]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).slice(0, 200);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'Provide id or ids.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('member_reimbursements')
    .select('id, status, approval_kind, decided_by_profile_id, decided_at, finance_processed_at')
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deciderIds = Array.from(
    new Set((rows || []).map((r) => r.decided_by_profile_id).filter((v): v is string => Boolean(v)))
  );
  const deciderName = new Map<string, string | null>();
  if (deciderIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, full_name').in('id', deciderIds);
    for (const profile of profiles || []) {
      deciderName.set(profile.id, profile.full_name);
    }
  }

  const results = (rows || []).map((r) => ({
    id: r.id,
    status: r.status as 'pending' | 'approved' | 'rejected',
    approval_kind: r.approval_kind as 'button' | 'signature' | null,
    decided_by_name: r.decided_by_profile_id ? deciderName.get(r.decided_by_profile_id) ?? null : null,
    decided_at: r.decided_at as string | null,
    finance_processed: Boolean(r.finance_processed_at)
  }));

  return NextResponse.json({ ok: true, results });
}
