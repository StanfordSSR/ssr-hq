import { describe, it, expect } from 'vitest';
import {
  detectPurchaseCategory,
  normalizePaymentMethod,
  parsePurchaseAmount,
  isReceiptRequired,
  getReceiptTaskState
} from '@/lib/purchases';

describe('detectPurchaseCategory', () => {
  it('classifies food, travel, and equipment', () => {
    expect(detectPurchaseCategory('Team pizza night')).toBe('food');
    expect(detectPurchaseCategory('Boba run')).toBe('food');
    expect(detectPurchaseCategory('Zipcar rental')).toBe('travel');
    expect(detectPurchaseCategory('Flight to competition')).toBe('travel');
    expect(detectPurchaseCategory('Tournament registration fee')).toBe('registration');
    expect(detectPurchaseCategory('Motor controller')).toBe('equipment');
  });
});

describe('normalizePaymentMethod', () => {
  it('maps free text to canonical methods', () => {
    expect(normalizePaymentMethod('reimbursement')).toBe('reimbursement');
    expect(normalizePaymentMethod('Venmo')).toBe('reimbursement');
    expect(normalizePaymentMethod('credit card')).toBe('credit_card');
    expect(normalizePaymentMethod('AMEX')).toBe('credit_card');
    expect(normalizePaymentMethod('Amazon')).toBe('amazon');
    expect(normalizePaymentMethod('')).toBe('unknown');
    expect(normalizePaymentMethod('something else')).toBe('unknown');
  });
});

describe('parsePurchaseAmount', () => {
  it('parses currency strings, parentheses, and numbers', () => {
    expect(parsePurchaseAmount('$1,234.50')).toBe(1234.5);
    expect(parsePurchaseAmount('(5.00)')).toBe(-5);
    expect(parsePurchaseAmount(12.5)).toBe(12.5);
    expect(parsePurchaseAmount('  42 ')).toBe(42);
  });

  it('returns NaN for unparseable input', () => {
    expect(Number.isNaN(parsePurchaseAmount('abc'))).toBe(true);
    expect(Number.isNaN(parsePurchaseAmount(''))).toBe(true);
  });
});

describe('isReceiptRequired', () => {
  it('only requires receipts for credit-card purchases', () => {
    expect(isReceiptRequired('credit_card')).toBe(true);
    expect(isReceiptRequired('reimbursement')).toBe(false);
    expect(isReceiptRequired('amazon')).toBe(false);
    expect(isReceiptRequired('unknown')).toBe(false);
  });
});

describe('getReceiptTaskState', () => {
  it('marks an old credit-card purchase with no receipt as overdue', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const state = getReceiptTaskState({
      paymentMethod: 'credit_card',
      purchasedAt: tenDaysAgo,
      receiptPath: null
    });
    expect(state.required).toBe(true);
    expect(state.uploaded).toBe(false);
    expect(state.pending).toBe(true);
    expect(state.overdue).toBe(true);
  });

  it('is satisfied once a receipt is uploaded', () => {
    const state = getReceiptTaskState({
      paymentMethod: 'credit_card',
      purchasedAt: new Date().toISOString(),
      receiptPath: 'some/path.pdf'
    });
    expect(state.uploaded).toBe(true);
    expect(state.pending).toBe(false);
    expect(state.overdue).toBe(false);
  });

  it('does not require a receipt when marked not needed', () => {
    const state = getReceiptTaskState({
      paymentMethod: 'credit_card',
      purchasedAt: new Date().toISOString(),
      receiptPath: null,
      receiptNotNeeded: true
    });
    expect(state.required).toBe(false);
    expect(state.pending).toBe(false);
  });
});
