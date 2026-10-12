import { NextRequest, NextResponse } from 'next/server';
import { getViewerContext } from '@/lib/auth';
import {
  extractReceiptFields,
  isSupportedReceiptUpload,
  RECEIPT_EXTRACT_MAX_BYTES
} from '@/lib/openai-receipt';
import { env } from '@/lib/env';
import { getLeadTeamIds } from '@/lib/lead-state';

// Best-effort receipt autofill for finance officers and active team leads.
export const runtime = 'nodejs';

const ALLOWED_ROLES = new Set(['admin', 'president', 'vice_president', 'financial_officer']);

export async function POST(request: NextRequest) {
  const { currentRole, user } = await getViewerContext();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded file.' }, { status: 400 });
  }

  if (!ALLOWED_ROLES.has(currentRole)) {
    const teamId = String(formData.get('team_id') || '').trim();
    const leadTeams = currentRole === 'team_lead' ? await getLeadTeamIds(user.id) : [];
    if (!teamId || !leadTeams.includes(teamId)) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }
  }

  if (!env.openaiApiKey) {
    return NextResponse.json(
      { error: 'Receipt scanning is not configured. Enter the details manually.' },
      { status: 503 }
    );
  }

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Attach a receipt first.' }, { status: 400 });
  }

  // Images and PDFs are both supported (PDFs are read natively by OpenAI).
  if (!isSupportedReceiptUpload(file.type)) {
    return NextResponse.json(
      { error: 'Autofill needs a PNG, JPG, WEBP, GIF, or PDF receipt. Enter the details manually.' },
      { status: 415 }
    );
  }

  if (file.size > RECEIPT_EXTRACT_MAX_BYTES) {
    return NextResponse.json({ error: 'File must be under 6 MB.' }, { status: 413 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
    const extracted = await extractReceiptFields(base64, file.type);
    return NextResponse.json({ ok: true, ...extracted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the receipt.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
