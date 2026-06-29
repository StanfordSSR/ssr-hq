import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { recordAuditEvent } from '@/lib/audit';
import { evaluateCardViewGate, getDecryptedCard } from '@/lib/credit-card';

export const runtime = 'nodejs';

// Progressive reveal endpoint for the secure card view. CRITICAL: this never
// returns the whole card number or all CVV digits in one response — at most one
// 4-digit number group OR one CVV digit OR the expiry per request. It re-runs
// evaluateCardViewGate on EVERY call, so a page that went stale (left North
// America, lost region approval, or crossed into a new month) can't keep
// revealing. The decrypted card lives only in this server process for the
// duration of the request and is never logged.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub as string | undefined;
  if (!sub) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  // Re-check the full gate on every reveal. Anything other than a clean pass is
  // a hard 403 with a generic message (no detail about which rule failed).
  const gate = await evaluateCardViewGate(sub, request.headers);
  if (gate.state !== 'ok') {
    return NextResponse.json({ error: 'Not authorized to view the card right now.' }, { status: 403 });
  }

  let body: { field?: unknown; index?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Could not read your request.' }, { status: 400 });
  }

  const field = body.field;
  if (field !== 'number' && field !== 'cvv' && field !== 'expiry') {
    return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
  }

  const index = typeof body.index === 'number' && Number.isInteger(body.index) ? body.index : 0;

  const card = await getDecryptedCard();
  if (!card) {
    return NextResponse.json({ error: 'No card is on file.' }, { status: 404 });
  }

  // Audit every reveal with ONLY the field + index — never the value itself.
  await recordAuditEvent({
    actorId: sub,
    action: 'credit_card.revealed',
    targetType: 'credit_card',
    targetId: '1',
    summary: `Revealed a ${field} window of the shared card.`,
    details: { field, index }
  });

  if (field === 'number') {
    const digits = card.number.replace(/\D/g, '');
    const groupCount = Math.ceil(digits.length / 4);
    if (index < 0 || index >= groupCount) {
      return NextResponse.json({ error: 'That group is out of range.' }, { status: 400 });
    }
    // Exactly one 4-digit group (the last group may be shorter).
    const value = digits.slice(index * 4, index * 4 + 4);
    return NextResponse.json({ value, groupCount });
  }

  if (field === 'cvv') {
    const cvv = card.cvv.replace(/\D/g, '');
    if (index < 0 || index >= cvv.length) {
      return NextResponse.json({ error: 'That digit is out of range.' }, { status: 400 });
    }
    // Exactly ONE digit.
    return NextResponse.json({ value: cvv.charAt(index), length: cvv.length });
  }

  // field === 'expiry' — a single short value, safe to return whole.
  return NextResponse.json({ value: card.expiry });
}
