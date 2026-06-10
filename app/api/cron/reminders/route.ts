import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runQueuedNotificationsCron } from '@/lib/notification-queue';
import { purgeOldSubmissionFootprints } from '@/lib/reimbursements';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runQueuedNotificationsCron();
  const footprints = await purgeOldSubmissionFootprints();
  return NextResponse.json({ ...result, footprintsPurged: footprints.purged });
}
