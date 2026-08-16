import { describe, it, expect } from 'vitest';
import {
  isMonthDay,
  parseStartYear,
  mergeQuestions,
  getEoyWindow,
  yearSummaryWordLimit,
  summerPlanWordLimit,
  formatEoyCurrency,
  applyEoyTokens,
  emptyEoyReportData,
  DEFAULT_EOY_QUESTIONS,
  OPEN_WINDOW_DAYS,
  DAY_MS
} from '@/lib/eoy-report-shared';

describe('isMonthDay', () => {
  it('accepts a zero-padded MM-DD', () => {
    expect(isMonthDay('06-05')).toBe(true);
    expect(isMonthDay('12-31')).toBe(true);
  });

  it('rejects unpadded, wrong-length, or non-string values', () => {
    expect(isMonthDay('6-5')).toBe(false);
    expect(isMonthDay('2026-06-05')).toBe(false);
    expect(isMonthDay('')).toBe(false);
    expect(isMonthDay(null)).toBe(false);
    expect(isMonthDay(605)).toBe(false);
    expect(isMonthDay(undefined)).toBe(false);
  });
});

describe('parseStartYear', () => {
  it('reads the start year from a cycle string', () => {
    expect(parseStartYear('2025-26')).toBe(2025);
  });

  it('falls back to a finite year for garbage input rather than NaN', () => {
    const parsed = parseStartYear('oops');
    expect(Number.isFinite(parsed)).toBe(true);
  });
});

describe('getEoyWindow', () => {
  it('sets the deadline in the spring of the cycle that started the prior autumn', () => {
    const { dueAt } = getEoyWindow('2025-26', '06-05');
    expect(dueAt.getUTCFullYear()).toBe(2026);
  });

  it('opens exactly OPEN_WINDOW_DAYS before the deadline', () => {
    const { openAt, dueAt } = getEoyWindow('2025-26', '06-05');
    expect(dueAt.getTime() - openAt.getTime()).toBe(OPEN_WINDOW_DAYS * DAY_MS);
  });

  it('produces valid dates, not Invalid Date', () => {
    const { openAt, dueAt } = getEoyWindow('2025-26', '06-05');
    expect(Number.isNaN(openAt.getTime())).toBe(false);
    expect(Number.isNaN(dueAt.getTime())).toBe(false);
  });

  it('opens before it closes', () => {
    const { openAt, dueAt } = getEoyWindow('2025-26', '06-05');
    expect(openAt.getTime()).toBeLessThan(dueAt.getTime());
  });

  it('moves the whole window when the configured day changes', () => {
    const early = getEoyWindow('2025-26', '06-01');
    const late = getEoyWindow('2025-26', '06-15');
    expect(late.dueAt.getTime()).toBeGreaterThan(early.dueAt.getTime());
    expect(late.openAt.getTime()).toBeGreaterThan(early.openAt.getTime());
  });

  it('advances a full cycle for the next academic year', () => {
    const thisYear = getEoyWindow('2025-26', '06-05');
    const nextYear = getEoyWindow('2026-27', '06-05');
    expect(nextYear.dueAt.getUTCFullYear()).toBe(thisYear.dueAt.getUTCFullYear() + 1);
  });
});

describe('yearSummaryWordLimit', () => {
  it('gives bigger budgets a longer summary', () => {
    expect(yearSummaryWordLimit(10_001 * 100)).toBe(500);
  });

  it('keeps smaller budgets at the short limit', () => {
    expect(yearSummaryWordLimit(5_000 * 100)).toBe(250);
  });

  it('treats exactly the threshold as the short limit', () => {
    expect(yearSummaryWordLimit(10_000 * 100)).toBe(250);
  });

  it('handles a zero budget', () => {
    expect(yearSummaryWordLimit(0)).toBe(250);
  });
});

describe('summerPlanWordLimit', () => {
  it('scales with predicted summer spend', () => {
    expect(summerPlanWordLimit(0)).toBe(75);
    expect(summerPlanWordLimit(999 * 100)).toBe(75);
    expect(summerPlanWordLimit(1_000 * 100)).toBe(150);
    expect(summerPlanWordLimit(2_500 * 100)).toBe(150);
    expect(summerPlanWordLimit(2_501 * 100)).toBe(300);
  });

  it('is monotonically non-decreasing across the range', () => {
    const points = [0, 50_000, 100_000, 200_000, 250_000, 300_000, 1_000_000];
    const limits = points.map(summerPlanWordLimit);
    for (let i = 1; i < limits.length; i += 1) {
      expect(limits[i]).toBeGreaterThanOrEqual(limits[i - 1]);
    }
  });
});

describe('formatEoyCurrency', () => {
  it('formats cents as USD', () => {
    expect(formatEoyCurrency(123456)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatEoyCurrency(0)).toBe('$0.00');
  });

  it('formats a negative balance', () => {
    expect(formatEoyCurrency(-26200)).toContain('262.00');
  });
});

describe('mergeQuestions', () => {
  it('returns the defaults for null or non-object input', () => {
    expect(mergeQuestions(null)).toEqual(DEFAULT_EOY_QUESTIONS);
    expect(mergeQuestions('nope')).toEqual(DEFAULT_EOY_QUESTIONS);
    expect(mergeQuestions(undefined)).toEqual(DEFAULT_EOY_QUESTIONS);
  });

  it('keeps a stored override', () => {
    const merged = mergeQuestions({ summerSpend: 'How much for summer?' });
    expect(merged.summerSpend).toBe('How much for summer?');
  });

  it('falls back to the default for blank or non-string overrides', () => {
    const merged = mergeQuestions({ summerSpend: '   ', nextLeads: 42 });
    expect(merged.summerSpend).toBe(DEFAULT_EOY_QUESTIONS.summerSpend);
    expect(merged.nextLeads).toBe(DEFAULT_EOY_QUESTIONS.nextLeads);
  });

  it('keeps every other question at its default when one is overridden', () => {
    const merged = mergeQuestions({ summerSpend: 'x' });
    expect(merged.yearSummary).toBe(DEFAULT_EOY_QUESTIONS.yearSummary);
    expect(merged.reregister).toBe(DEFAULT_EOY_QUESTIONS.reregister);
  });

  it('uses stored acknowledgements when present and drops blanks', () => {
    const merged = mergeQuestions({ acknowledgements: ['I agree', '  ', ''] });
    expect(merged.acknowledgements).toEqual(['I agree']);
  });

  it('falls back to default acknowledgements when all are blank', () => {
    const merged = mergeQuestions({ acknowledgements: ['', '   '] });
    expect(merged.acknowledgements).toEqual(DEFAULT_EOY_QUESTIONS.acknowledgements);
  });

  it('always returns a complete question set', () => {
    const merged = mergeQuestions({});
    for (const key of Object.keys(DEFAULT_EOY_QUESTIONS)) {
      expect(merged[key as keyof typeof merged]).toBeTruthy();
    }
  });
});

describe('applyEoyTokens', () => {
  it('substitutes the team name', () => {
    expect(applyEoyTokens('How much will {team} spend?', { team: 'RoboSub' })).toBe(
      'How much will RoboSub spend?'
    );
  });

  it('substitutes every occurrence', () => {
    const out = applyEoyTokens('{team} and {team}', { team: 'SkyRunners' });
    expect(out).toBe('SkyRunners and SkyRunners');
  });

  it('leaves text without tokens untouched', () => {
    expect(applyEoyTokens('No tokens here', { team: 'X' })).toBe('No tokens here');
  });
});

describe('emptyEoyReportData', () => {
  it('starts summer spend at zero, not undefined', () => {
    expect(emptyEoyReportData().summer.predictedSpendCents).toBe(0);
  });

  it('returns a fresh object each call so drafts cannot alias', () => {
    const a = emptyEoyReportData();
    const b = emptyEoyReportData();
    a.summer.predictedSpendCents = 5000;
    expect(b.summer.predictedSpendCents).toBe(0);
  });
});
