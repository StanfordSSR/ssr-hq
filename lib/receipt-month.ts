// Month helpers for the receipts view. Kept pure (and parameterized on "now")
// so the month-selection logic is unit-testable.

export type PacificDateParts = { year: number; month: number; day: number };

// The Pacific calendar Y/M/D for an instant.
export function pacificDateParts(date = new Date()): PacificDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value || '0'),
    month: Number(parts.find((part) => part.type === 'month')?.value || '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value || '1')
  };
}

// The default receipts month is the month that contained the date 10 days ago
// (Pacific): ~10 days of grace for the previous month's receipts to arrive
// before the view rolls forward. e.g. May 9 -> April, May 11 -> May.
export function defaultReceiptMonthValue(now: PacificDateParts = pacificDateParts()): string {
  const tenDaysAgo = new Date(Date.UTC(now.year, now.month - 1, now.day - 10, 12));
  return `${tenDaysAgo.getUTCFullYear()}-${String(tenDaysAgo.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Pacific calendar year-month ('YYYY-MM') for a stored timestamp, so receipts
// bucket by the month they read as in Pacific time (not UTC).
export function pacificYearMonth(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  return `${year}-${month}`;
}
