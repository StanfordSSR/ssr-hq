import { describe, it, expect } from 'vitest';
import { isSupportedReceiptImage, parseExtractedReceipt } from '@/lib/openai-receipt';

describe('isSupportedReceiptImage', () => {
  it('accepts common raster image types', () => {
    expect(isSupportedReceiptImage('image/png')).toBe(true);
    expect(isSupportedReceiptImage('image/jpeg')).toBe(true);
    expect(isSupportedReceiptImage('image/webp')).toBe(true);
    expect(isSupportedReceiptImage('image/gif')).toBe(true);
  });

  it('rejects unsupported or missing types', () => {
    expect(isSupportedReceiptImage('application/pdf')).toBe(false);
    expect(isSupportedReceiptImage('image/svg+xml')).toBe(false);
    expect(isSupportedReceiptImage('')).toBe(false);
    expect(isSupportedReceiptImage(null)).toBe(false);
    expect(isSupportedReceiptImage(undefined)).toBe(false);
  });
});

describe('parseExtractedReceipt', () => {
  it('keeps valid purchase dates and the Other category', () => {
    expect(parseExtractedReceipt({ item_name: 'Lab supplies', amount: '$12.50', category: 'other', purchase_date: '2026-09-25' }))
      .toMatchObject({ itemName: 'Lab supplies', amount: 12.5, category: 'other', purchasedAt: '2026-09-25' });
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseExtractedReceipt({ purchase_date: '2026-02-30' }).purchasedAt).toBeNull();
    expect(parseExtractedReceipt({ purchase_date: '09/25/2026' }).purchasedAt).toBeNull();
  });
});
