import { describe, expect, it } from 'vitest';
import { validatePurchaseDate } from '@/lib/reimbursement-cycle';

describe('reimbursement purchase dates', () => {
  it('includes September 1 in the new cycle before budget approval', () => {
    expect(validatePurchaseDate('2026-09-01', '2026-27', '2026-10-11')).toBeNull();
  });

  it('rejects last-cycle and future purchases', () => {
    expect(validatePurchaseDate('2026-08-31', '2026-27', '2026-10-11')).toContain('September 1');
    expect(validatePurchaseDate('2026-10-12', '2026-27', '2026-10-11')).toContain('future');
  });

  it('rejects malformed calendar dates', () => {
    expect(validatePurchaseDate('2026-09-31', '2026-27', '2026-10-11')).toContain('Enter the date');
  });
});
