import { NextRequest, NextResponse } from 'next/server';
import { getViewerContext, profileHasPresidentRole } from '@/lib/auth';
import {
  extractReceiptFields,
  isSupportedReceiptUpload,
  RECEIPT_EXTRACT_MAX_BYTES
} from '@/lib/openai-receipt';
import { env } from '@/lib/env';

// Authenticated receipt autofill for the leadership / operations expense logger.
// Admins and presidents can upload a receipt image and have the item, amount,
// and category read with OpenAI vision. Best-effort only — the values land in
// editable fields, so a failed or low-confidence read never blocks logging.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { profile, currentRole } = await getViewerContext();
  const allowed =
    currentRole === 'admin' || currentRole === 'president' || profileHasPresidentRole(profile);
  if (!allowed) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  if (!env.openaiApiKey) {
    return NextResponse.json(
      { error: 'Receipt scanning is not configured. Enter the details manually.' },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded image.' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Attach a receipt image first.' }, { status: 400 });
  }

  // Images and PDFs are both supported (PDFs are read natively by OpenAI).
  if (!isSupportedReceiptUpload(file.type)) {
    return NextResponse.json(
      { error: 'Autofill needs a PNG, JPG, WEBP, GIF, or PDF receipt. Enter the details manually.' },
      { status: 415 }
    );
  }

  if (file.size > RECEIPT_EXTRACT_MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 6 MB.' }, { status: 413 });
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
