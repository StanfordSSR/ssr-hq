export type PurchaseCategory =
  | 'equipment'
  | 'food'
  | 'gas'
  | 'car_rental'
  | 'accommodation'
  | 'travel_fares'
  | 'other';
export type PurchasePaymentMethod = 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
export type ReceiptNotificationSettings = {
  emailEnabled: boolean;
  slackEnabled: boolean;
  reminderDays: number[];
};

export const RECEIPT_BUCKET = 'purchase-receipts';
export const RECEIPT_MAX_BYTES = 2 * 1024 * 1024;
export const RECEIPT_ALLOWED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const FOOD_PATTERN =
  /(pizza|boba|food|meal|snack|lunch|dinner|breakfast|coffee|cafe|restaurant|doordash|ubereats)/;
const GAS_PATTERN = /(gas|fuel|petrol|shell|chevron|exxon|arco|76\b)/;
const ACCOMMODATION_PATTERN = /(hotel|motel|hostel|airbnb|lodg|accommodation|\binn\b|resort)/;
const CAR_RENTAL_PATTERN = /(zipcar|hertz|avis|enterprise|rental car|car rental|budget rent|getaround|turo)/;
const TRAVEL_FARES_PATTERN = /(flight|airfare|uber|lyft|train|caltrain|amtrak|bart|mileage|parking|toll|fare|transit)/;

export const PURCHASE_CATEGORIES: PurchaseCategory[] = [
  'equipment',
  'food',
  'gas',
  'car_rental',
  'accommodation',
  'travel_fares',
  'other'
];

export function isPurchaseCategory(value: unknown): value is PurchaseCategory {
  return typeof value === 'string' && (PURCHASE_CATEGORIES as string[]).includes(value);
}

// Travel sub-categories grouped under a single "Travel" bucket for summaries.
export const TRAVEL_CATEGORIES: PurchaseCategory[] = ['gas', 'car_rental', 'accommodation', 'travel_fares'];

export function isTravelCategory(value: unknown): boolean {
  return typeof value === 'string' && (TRAVEL_CATEGORIES as string[]).includes(value);
}

export function detectPurchaseCategory(description: string): PurchaseCategory {
  const value = description.toLowerCase();

  if (FOOD_PATTERN.test(value)) return 'food';
  if (CAR_RENTAL_PATTERN.test(value)) return 'car_rental';
  if (ACCOMMODATION_PATTERN.test(value)) return 'accommodation';
  if (GAS_PATTERN.test(value)) return 'gas';
  if (TRAVEL_FARES_PATTERN.test(value)) return 'travel_fares';

  return 'equipment';
}

export function normalizePaymentMethod(value: string): PurchasePaymentMethod {
  const normalized = value.toLowerCase().trim();

  if (!normalized) {
    return 'unknown';
  }

  if (/(reimb|reimburse|venmo|cash)/.test(normalized)) {
    return 'reimbursement';
  }

  if (/(card|credit|amex|visa|mastercard|pcard)/.test(normalized)) {
    return 'credit_card';
  }

  if (/(amazon)/.test(normalized)) {
    return 'amazon';
  }

  return 'unknown';
}

export function isReceiptRequired(paymentMethod: PurchasePaymentMethod) {
  return paymentMethod === 'credit_card';
}

export function normalizeReminderDays(values: Array<string | number | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0 && value <= 365)
    )
  )
    .sort((a, b) => a - b)
    .slice(0, 3);
}

export function differenceInDays(target: Date, now = new Date()) {
  return Math.floor((now.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
}

export function getReceiptTaskState({
  paymentMethod,
  purchasedAt,
  receiptPath,
  receiptNotNeeded
}: {
  paymentMethod: PurchasePaymentMethod;
  purchasedAt: string;
  receiptPath?: string | null;
  receiptNotNeeded?: boolean;
}) {
  const required = !receiptNotNeeded && isReceiptRequired(paymentMethod);
  const uploaded = Boolean(receiptPath);
  const ageDays = differenceInDays(new Date(purchasedAt));
  const overdue = required && !uploaded && ageDays >= 7;

  return {
    required,
    uploaded,
    pending: required && !uploaded,
    overdue,
    ageDays
  };
}

export function parsePurchaseAmount(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const text = String(value ?? '').trim();
  if (!text) {
    return NaN;
  }

  const normalized = text
    .replace(/^\((.*)\)$/, '-$1')
    .replace(/[$,\s]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
}

function excelSerialToIso(serial: number) {
  if (!Number.isFinite(serial) || serial < 1) {
    return '';
  }

  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = serial - Math.floor(serial);
  const totalSeconds = Math.round(86400 * fractionalDay);

  dateInfo.setUTCHours(0, 0, totalSeconds, 0);
  return Number.isNaN(dateInfo.getTime()) ? '' : dateInfo.toISOString();
}

export function normalizePurchaseDate(value: unknown) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }

  if (typeof value === 'number') {
    return excelSerialToIso(value);
  }

  const text = String(value).trim();
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return new Date(`${text}T12:00:00Z`).toISOString();
  }

  if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
    return new Date(`${text.replaceAll('/', '-')}T12:00:00Z`).toISOString();
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    return excelSerialToIso(Number(text));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

export function sanitizeStorageFileName(value: string) {
  const trimmed = value.trim().toLowerCase();
  const sanitized = trimmed.replace(/[^a-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || 'receipt';
}
