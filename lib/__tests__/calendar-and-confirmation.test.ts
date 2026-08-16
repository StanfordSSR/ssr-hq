import { describe, it, expect } from 'vitest';
import {
  formatAcademicYear,
  getNextAcademicYear,
  getPreviousAcademicYear,
  formatPacificDateKey,
  formatPacificDateLabel,
  formatCountdown
} from '@/lib/academic-calendar';
import { confirmationMatches } from '@/lib/confirmation';

describe('formatAcademicYear', () => {
  it('rolls to the new cycle in September', () => {
    expect(formatAcademicYear(new Date(2026, 8, 22))).toBe('2026-27');
  });

  it('keeps August in the previous cycle', () => {
    expect(formatAcademicYear(new Date(2026, 7, 31))).toBe('2025-26');
  });

  it('puts spring quarter in the cycle that began the prior autumn', () => {
    expect(formatAcademicYear(new Date(2026, 4, 15))).toBe('2025-26');
  });

  it('handles a January date', () => {
    expect(formatAcademicYear(new Date(2026, 0, 5))).toBe('2025-26');
  });

  it('spans a century boundary', () => {
    expect(formatAcademicYear(new Date(2099, 9, 1))).toBe('2099-00');
  });
});

describe('academic year navigation', () => {
  it('advances and rewinds a cycle', () => {
    expect(getNextAcademicYear('2025-26')).toBe('2026-27');
    expect(getPreviousAcademicYear('2025-26')).toBe('2024-25');
  });

  it('round-trips', () => {
    expect(getPreviousAcademicYear(getNextAcademicYear('2025-26'))).toBe('2025-26');
  });

  it('returns the input unchanged when it is not a cycle string', () => {
    expect(getNextAcademicYear('not-a-year')).toBe('not-a-year');
    expect(getPreviousAcademicYear('')).toBe('');
  });

  it('crosses a decade boundary', () => {
    expect(getNextAcademicYear('2029-30')).toBe('2030-31');
  });
});

describe('formatPacificDateKey', () => {
  it('produces a sortable YYYY-MM-DD key', () => {
    expect(formatPacificDateKey(new Date('2026-07-15T19:00:00Z'))).toBe('2026-07-15');
  });

  it('maps a late-UTC instant back to the prior Pacific day', () => {
    // 02:00 UTC on Jul 1 is 19:00 Pacific on Jun 30.
    expect(formatPacificDateKey(new Date('2026-07-01T02:00:00Z'))).toBe('2026-06-30');
  });

  it('handles the winter offset (PST) as well as summer (PDT)', () => {
    expect(formatPacificDateKey(new Date('2026-01-01T05:00:00Z'))).toBe('2025-12-31');
    expect(formatPacificDateKey(new Date('2026-01-01T09:00:00Z'))).toBe('2026-01-01');
  });

  it('sorts lexicographically in true chronological order', () => {
    const keys = [
      formatPacificDateKey(new Date('2026-10-02T18:00:00Z')),
      formatPacificDateKey(new Date('2026-02-10T18:00:00Z')),
      formatPacificDateKey(new Date('2026-10-10T18:00:00Z'))
    ];
    expect([...keys].sort()).toEqual(['2026-02-10', '2026-10-02', '2026-10-10']);
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatPacificDateKey(new Date('2026-03-05T20:00:00Z'))).toBe('2026-03-05');
  });
});

describe('formatPacificDateLabel', () => {
  it('shows the intended Pacific day for an evening deadline', () => {
    // 6 PM Pacific on Jun 5 is Jun 6 in UTC; the label must still say June 5.
    expect(formatPacificDateLabel(new Date('2026-06-06T01:00:00Z'))).toBe('June 5, 2026');
  });
});

describe('formatCountdown', () => {
  const now = new Date('2026-07-01T12:00:00Z');

  it('says "today" when the deadline is now or past', () => {
    expect(formatCountdown(now, now)).toBe('today');
    expect(formatCountdown(new Date('2026-06-01T12:00:00Z'), now)).toBe('today');
  });

  it('uses the singular for one day', () => {
    expect(formatCountdown(new Date('2026-07-02T12:00:00Z'), now)).toBe('1 day');
  });

  it('pluralizes beyond one day', () => {
    expect(formatCountdown(new Date('2026-07-08T12:00:00Z'), now)).toBe('7 days');
  });

  it('rounds a partial day up, so "due tomorrow morning" is not shown as today', () => {
    expect(formatCountdown(new Date('2026-07-02T01:00:00Z'), now)).toBe('1 day');
  });

  it('never returns a negative count', () => {
    expect(formatCountdown(new Date('2020-01-01T00:00:00Z'), now)).toBe('today');
  });
});

describe('confirmationMatches', () => {
  const person = { fullName: 'Ryota Sato', email: 'ryota@stanford.edu' };

  it('accepts the exact name', () => {
    expect(confirmationMatches('Ryota Sato', person)).toBe(true);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(confirmationMatches('  ryota sato  ', person)).toBe(true);
    expect(confirmationMatches('RYOTA SATO', person)).toBe(true);
  });

  it('collapses repeated inner whitespace', () => {
    expect(confirmationMatches('Ryota   Sato', person)).toBe(true);
  });

  it('accepts the email as an alternative', () => {
    expect(confirmationMatches('RYOTA@stanford.edu', person)).toBe(true);
  });

  it('rejects a different person', () => {
    expect(confirmationMatches('Eric Liang', person)).toBe(false);
  });

  it('rejects empty or whitespace-only input', () => {
    expect(confirmationMatches('', person)).toBe(false);
    expect(confirmationMatches('   ', person)).toBe(false);
  });

  it('rejects a partial name — deletion must be deliberate', () => {
    expect(confirmationMatches('Ryota', person)).toBe(false);
  });

  it('accepts the displayed fallback when the profile has no name', () => {
    const anonymous = { fullName: null, email: 'ghost@stanford.edu' };
    expect(confirmationMatches('Unnamed user', anonymous)).toBe(true);
    expect(confirmationMatches('unnamed lead', anonymous)).toBe(true);
    expect(confirmationMatches('ghost@stanford.edu', anonymous)).toBe(true);
  });

  it('does not accept the fallback when a real name exists', () => {
    expect(confirmationMatches('Unnamed user', person)).toBe(false);
  });

  it('rejects everything for an identity with no name and no email', () => {
    expect(confirmationMatches('anything', { fullName: null, email: null })).toBe(false);
  });
});
