import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { markCardFirstViewed } from '@/lib/credit-card';

export const runtime = 'nodejs';

// Tiny endpoint the secure card view calls when the user dismisses the one-time
// first-view reminder, so it only ever shows once. No card data involved.
export async function POST() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub as string | undefined;
  if (!sub) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  await markCardFirstViewed(sub);
  return NextResponse.json({ ok: true });
}
