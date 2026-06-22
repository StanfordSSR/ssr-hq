import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import { profileHasAdminRole, profileHasPresidentRole } from '@/lib/auth';
import {
  generateToken,
  pacificDateKey,
  verifyIssuerSignature
} from '@/lib/visitor-agreements';

export const runtime = 'nodejs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A president (or admin) issues an unguessable visitor contract link. They must
// be active and hold the president or admin role, and they sign the request so
// we can verify the drawing against their enrolled signature profile.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const sub = claimsData?.claims?.sub as string | undefined;
  if (!sub) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('id, full_name, role, is_admin, is_president, active')
    .eq('id', sub)
    .maybeSingle();

  if (!profile?.active || !(profileHasPresidentRole(profile) || profileHasAdminRole(profile))) {
    return NextResponse.json(
      { error: 'Only an active president or admin can issue visitor links.' },
      { status: 403 }
    );
  }

  let body: {
    access_start?: unknown;
    access_end?: unknown;
    strokes?: unknown;
    signature?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Could not read your request.' }, { status: 400 });
  }

  const accessStart = typeof body.access_start === 'string' ? body.access_start.trim() : '';
  const accessEnd = typeof body.access_end === 'string' ? body.access_end.trim() : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';

  if (!accessStart || !accessEnd || !DATE_RE.test(accessStart) || !DATE_RE.test(accessEnd)) {
    return NextResponse.json({ error: 'Pick a valid start and end date.' }, { status: 400 });
  }
  if (accessStart > accessEnd) {
    return NextResponse.json(
      { error: 'The start date must be on or before the end date.' },
      { status: 400 }
    );
  }
  if (accessEnd < pacificDateKey()) {
    return NextResponse.json({ error: 'The end date cannot be in the past.' }, { status: 400 });
  }
  if (!signature) {
    return NextResponse.json({ error: 'Draw your signature to issue the link.' }, { status: 400 });
  }

  try {
    await verifyIssuerSignature(sub, body.strokes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not verify your signature.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const contractToken = generateToken();
  const issuerName = profile.full_name || 'SSR President';
  const { data: inserted, error: insertError } = await admin
    .from('visitor_agreements')
    .insert({
      contract_token: contractToken,
      issued_by: sub,
      issuer_name: issuerName,
      access_start: accessStart,
      access_end: accessEnd,
      issuer_signature: signature,
      status: 'pending'
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message || 'Could not create the visitor link. Try again.' },
      { status: 500 }
    );
  }

  await recordAuditEvent({
    actorId: sub,
    action: 'visitor_agreement.issued',
    targetType: 'visitor_agreement',
    targetId: inserted.id,
    summary: `${issuerName} issued an external visitor access link (${accessStart} – ${accessEnd}).`,
    details: { accessStart, accessEnd }
  });

  return NextResponse.json({
    ok: true,
    contractUrl: `${env.siteUrl}/visit/${contractToken}`
  });
}
