import { describe, it, expect } from 'vitest';
import { defaultReceiptMonthValue, pacificYearMonth } from '@/lib/receipt-month';

describe('defaultReceiptMonthValue', () => {
  it('shows the prior month within the first 10 days', () => {
    expect(defaultReceiptMonthValue({ year: 2025, month: 5, day: 9 })).toBe('2025-04');
    expect(defaultReceiptMonthValue({ year: 2025, month: 5, day: 1 })).toBe('2025-04');
  });

  it('rolls to the current month after the 10th', () => {
    expect(defaultReceiptMonthValue({ year: 2025, month: 5, day: 11 })).toBe('2025-05');
    expect(defaultReceiptMonthValue({ year: 2025, month: 5, day: 31 })).toBe('2025-05');
  });

  it('rolls back across a year boundary', () => {
    expect(defaultReceiptMonthValue({ year: 2025, month: 1, day: 5 })).toBe('2024-12');
  });
});

describe('pacificYearMonth', () => {
  it('buckets a noon-UTC date by its Pacific month', () => {
    expect(pacificYearMonth('2025-05-01T12:00:00Z')).toBe('2025-05');
  });

  it('buckets a late-evening-Pacific timestamp into the Pacific calendar month', () => {
    // 2025-05-01T05:00:00Z is 2025-04-30 22:00 in Pacific (PDT) — i.e. still April.
    expect(pacificYearMonth('2025-05-01T05:00:00Z')).toBe('2025-04');
  });
});
