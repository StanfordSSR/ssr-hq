import { describe, it, expect } from 'vitest';
import { getEoyWindow } from '@/lib/eoy-report-shared';

describe('getEoyWindow', () => {
  it('closes at 6 PM Pacific (PDT) on the configured June day', () => {
    const { dueAt } = getEoyWindow('2025-26', '06-21');
    // 6 PM PDT on June 21, 2026 is 01:00 UTC on June 22, 2026.
    expect(dueAt.toISOString()).toBe('2026-06-22T01:00:00.000Z');
  });

  it('uses the academic year start + 1 for the deadline year', () => {
    const { dueAt } = getEoyWindow('2026-27', '06-21');
    expect(dueAt.getUTCFullYear()).toBe(2027);
  });
});
