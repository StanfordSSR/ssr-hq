import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { recordAuditEvent } from '@/lib/audit';
import { evaluateCardViewGate, getDecryptedCard } from '@/lib/credit-card';

export const runtime = 'nodejs';

// Reveal endpoint for the secure card view. It re-runs evaluateCardViewGate on
// EVERY call, so a stale page (left North America, lost region approval, crossed
// into a new month) can't read the card. The decrypted card lives only in this
// server process for the duration of the request and is never logged.
//
// field === 'all' returns the full card in one response (number groups, expiry,
// and the whole CVV) so the client can warm a cache and reveal instantly with no
// per-hold latency. The on-screen protections (press-and-hold, one window shown
// at a time, identity watermark) are what limit screenshot exposure — not the
// transport. Single-field requests ('number' | 'cvv' | 'expiry') are also still
// supported.
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
  if (field !== 'number' && field !== 'cvv' && field !== 'expiry' && field !== 'all') {
    return NextResponse.json({ error: 'Unknown field.' }, { status: 400 });
  }

  const index = typeof body.index === 'number' && Number.isInteger(body.index) ? body.index : 0;

  const card = await getDecryptedCard();
  if (!card) {
    return NextResponse.json({ error: 'No card is on file.' }, { status: 404 });
  }

  // Audit the access with ONLY the field (+ index for single windows) — never the
  // value itself. 'all' is logged as opening the card for viewing.
  await recordAuditEvent({
    actorId: sub,
    action: 'credit_card.revealed',
    targetType: 'credit_card',
    targetId: '1',
    summary:
      field === 'all'
        ? 'Opened the shared card for viewing.'
        : `Revealed a ${field} window of the shared card.`,
    details: field === 'all' ? { field } : { field, index }
  });

  if (field === 'all') {
    const digits = card.number.replace(/\D/g, '');
    const groupCount = Math.ceil(digits.length / 4);
    const numberGroups = Array.from({ length: groupCount }, (_, i) =>
      digits.slice(i * 4, i * 4 + 4)
    );
    return NextResponse.json({
      numberGroups,
      expiry: card.expiry,
      cvv: card.cvv.replace(/\D/g, '')
    });
  }

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
