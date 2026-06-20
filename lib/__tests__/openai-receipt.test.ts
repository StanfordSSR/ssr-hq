import { describe, it, expect } from 'vitest';
import { isSupportedReceiptImage } from '@/lib/openai-receipt';

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
