import { NextRequest, NextResponse } from 'next/server';
import {
  extractReceiptFields,
  isSupportedReceiptImage,
  RECEIPT_EXTRACT_MAX_BYTES
} from '@/lib/openai-receipt';
import { env } from '@/lib/env';

// Public endpoint: a member pastes/uploads a receipt screenshot on /submit and
// we read the item + amount with OpenAI vision. Best-effort autofill only.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
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

  if (!isSupportedReceiptImage(file.type)) {
    return NextResponse.json(
      { error: 'Upload a PNG, JPG, WEBP, or GIF image of the receipt.' },
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
