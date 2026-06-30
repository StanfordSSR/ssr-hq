import { env } from '@/lib/env';

// Reads a pasted/uploaded receipt screenshot with OpenAI vision and pulls out
// the two fields the public intake form needs: a short item description and the
// total amount. Best-effort only — the member can always correct the values
// before submitting, so a low-confidence or failed read never blocks them.

export type ExpenseCategory = 'equipment' | 'food' | 'travel' | 'registration';

export type ExtractedReceipt = {
  itemName: string | null;
  amount: number | null;
  merchant: string | null;
  reimbursementNumber: string | null;
  category: ExpenseCategory | null;
};

const EXPENSE_CATEGORIES: ExpenseCategory[] = ['equipment', 'food', 'travel', 'registration'];

function coerceCategory(value: unknown): ExpenseCategory | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (EXPENSE_CATEGORIES as string[]).includes(normalized)
    ? (normalized as ExpenseCategory)
    : null;
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// PDFs are sent to OpenAI as a native "file" part (it renders the pages itself).
const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];
export const RECEIPT_EXTRACT_MAX_BYTES = 6 * 1024 * 1024;

export function isSupportedReceiptImage(mimeType: string | null | undefined) {
  return Boolean(mimeType && ALLOWED_IMAGE_TYPES.includes(mimeType));
}

// Anything we can hand to the scanner: images OR PDFs.
export function isSupportedReceiptUpload(mimeType: string | null | undefined) {
  return Boolean(mimeType && ALLOWED_UPLOAD_TYPES.includes(mimeType));
}

function coerceAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.round(value * 100) / 100 : null;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
  }
  return null;
}

function coerceText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : trimmed ? trimmed.slice(0, 160) : null;
}

// Pull a Stanford Granted reimbursement number (e.g. "R-119704") out of whatever
// the model returns, normalized to "R-<digits>". Null if it's not present.
function coerceReimbursementNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.toUpperCase().match(/R[-\s]?(\d{3,})/);
  return match ? `R-${match[1]}` : null;
}

export async function extractReceiptFields(
  fileBase64: string,
  mimeType: string
): Promise<ExtractedReceipt> {
  if (!env.openaiApiKey) {
    throw new Error('Receipt scanning is not configured. Enter the details manually.');
  }

  // Images go as an image_url part; PDFs go as a native file part that OpenAI
  // renders server-side (no local PDF→image conversion needed).
  const mediaPart =
    mimeType === 'application/pdf'
      ? {
          type: 'file',
          file: {
            filename: 'receipt.pdf',
            file_data: `data:application/pdf;base64,${fileBase64}`
          }
        }
      : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileBase64}` } };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: env.openaiReceiptModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You read receipts, order confirmations, and Stanford Granted reimbursement ' +
              'screenshots for a student robotics club. ' +
              'Return ONLY a JSON object with keys: item_name (a short human description ' +
              'of what was bought, e.g. "Motor controller" or "Team pizza" — prefer the ' +
              'main line item, or a brief summary if there are several), amount (the grand ' +
              'total actually paid, as a number, including tax and shipping), merchant ' +
              '(the store name if visible), reimbursement_number (a Stanford Granted ' +
              'reimbursement number of the form "R-119704" if one appears in the image, e.g. ' +
              'on a Granted portal confirmation), and category (classify the purchase as ' +
              'exactly one of "equipment" (parts, tools, hardware, electronics, materials), ' +
              '"food" (meals, snacks, catering, groceries), "travel" (flights, hotels, gas, ' +
              'rideshare, transit), or "registration" (competition or event registration / ' +
              'entry fees); use null if genuinely unsure). ' +
              'Use null for any field you cannot read with confidence. Never invent values.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract the item description, total amount paid, and category from this receipt.'
              },
              mediaPart
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Receipt scan failed (${response.status}). ${detail.slice(0, 200)}`.trim());
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) {
      return { itemName: null, amount: null, merchant: null, reimbursementNumber: null, category: null };
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { itemName: null, amount: null, merchant: null, reimbursementNumber: null, category: null };
    }

    return {
      itemName: coerceText(parsed.item_name),
      amount: coerceAmount(parsed.amount),
      merchant: coerceText(parsed.merchant),
      reimbursementNumber: coerceReimbursementNumber(parsed.reimbursement_number),
      category: coerceCategory(parsed.category)
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Receipt scan timed out. Enter the details manually.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
