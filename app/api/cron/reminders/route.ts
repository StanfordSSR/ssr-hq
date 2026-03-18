import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { runQueuedNotificationsCron } from '@/lib/notification-queue';

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runQueuedNotificationsCron();
  return NextResponse.json(result);
}
