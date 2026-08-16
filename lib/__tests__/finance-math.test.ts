import { describe, it, expect } from 'vitest';
import {
  sumAmounts,
  remainingCents,
  utilizationPercent,
  isOverBudget,
  categoryTotals,
  chartDenominator,
  donutSlices,
  donutGradient,
  averagePurchaseCents,
  costPerMemberCents,
  bigTicketPurchases,
  sumInDateRange,
  allocationSummary,
  CATEGORY_COLORS,
  UNSPENT_COLOR
} from '@/lib/finance-math';
import { formatPacificDateKey } from '@/lib/academic-calendar';

// Row factory: the extra fields (category, purchased_at, id) vary per test,
// so keep the return type open rather than fighting inference.
const p = (amount_cents: number, extra: Record<string, unknown> = {}) =>
  ({ amount_cents, ...extra }) as {
    amount_cents: number;
    category?: string | null;
    purchased_at: string;
    id?: string;
  };

describe('sumAmounts', () => {
  it('sums integer cents exactly', () => {
    expect(sumAmounts([p(1005), p(34161), p(20000)])).toBe(55166);
  });

  it('returns zero for an empty list', () => {
    expect(sumAmounts([])).toBe(0);
  });

  it('handles refunds recorded as negative amounts', () => {
    expect(sumAmounts([p(10000), p(-2500)])).toBe(7500);
  });
});

describe('remainingCents', () => {
  it('subtracts spend from budget', () => {
    expect(remainingCents(2500000, 1874300)).toBe(625700);
  });

  it('goes negative when overspent rather than clamping', () => {
    // RoboSub's real case: $25,262.00 spent against a $25,000 budget.
    expect(remainingCents(2500000, 2526200)).toBe(-26200);
  });

  it('equals the budget when nothing is spent', () => {
    expect(remainingCents(500000, 0)).toBe(500000);
  });
});

describe('utilizationPercent', () => {
  it('computes a rounded percentage', () => {
    expect(utilizationPercent(2500000, 1874300)).toBe(75);
  });

  it('returns 0 when no budget is set, never a full bar', () => {
    expect(utilizationPercent(0, 500000)).toBe(0);
    expect(utilizationPercent(-100, 500000)).toBe(0);
  });

  it('clamps overspending to 100 so bars never overflow', () => {
    expect(utilizationPercent(1000, 5000)).toBe(100);
  });

  it('never returns a negative width for a refund-heavy team', () => {
    expect(utilizationPercent(100000, -5000)).toBe(0);
  });

  it('is 0 at zero spend and 100 at exact budget', () => {
    expect(utilizationPercent(100000, 0)).toBe(0);
    expect(utilizationPercent(100000, 100000)).toBe(100);
  });
});

describe('isOverBudget', () => {
  it('is true only when spend exceeds a real budget', () => {
    expect(isOverBudget(2500000, 2526200)).toBe(true);
    expect(isOverBudget(2500000, 2500000)).toBe(false);
    expect(isOverBudget(2500000, 10)).toBe(false);
  });

  it('is false when no budget is configured (not "infinitely over")', () => {
    expect(isOverBudget(0, 100000)).toBe(false);
  });
});

describe('categoryTotals', () => {
  it('buckets amounts by category', () => {
    const totals = categoryTotals([
      p(1000, { category: 'equipment' }),
      p(2000, { category: 'food' }),
      p(3000, { category: 'travel' }),
      p(4000, { category: 'registration' }),
      p(500, { category: 'equipment' })
    ]);
    expect(totals).toEqual({ equipment: 1500, food: 2000, travel: 3000, registration: 4000 });
  });

  it('treats missing or unknown categories as equipment', () => {
    const totals = categoryTotals([p(100), p(200, { category: null }), p(300, { category: 'mystery' })]);
    expect(totals.equipment).toBe(600);
  });

  it('returns all-zero totals for no rows', () => {
    expect(categoryTotals([])).toEqual({ equipment: 0, food: 0, travel: 0, registration: 0 });
  });

  it('conserves the total across buckets', () => {
    const rows = [p(111, { category: 'food' }), p(222, { category: 'travel' }), p(333)];
    const totals = categoryTotals(rows);
    const bucketed = Object.values(totals).reduce((a, b) => a + b, 0);
    expect(bucketed).toBe(sumAmounts(rows));
  });
});

describe('chartDenominator', () => {
  it('uses the budget while spending is within it', () => {
    expect(chartDenominator(100000, 40000)).toBe(100000);
  });

  it('switches to total spend once overspent, so shares stay <= 100%', () => {
    expect(chartDenominator(100000, 150000)).toBe(150000);
  });

  it('falls back to spend when no budget is set', () => {
    expect(chartDenominator(0, 8000)).toBe(8000);
  });
});

describe('donutSlices', () => {
  const totals = { equipment: 5000, food: 2500, travel: 2500, registration: 0 };

  it('produces contiguous slices that end at 100%', () => {
    const slices = donutSlices(totals, 20000);
    expect(slices[0].start).toBe(0);
    for (let i = 1; i < slices.length; i += 1) {
      expect(slices[i].start).toBeCloseTo(slices[i - 1].end, 10);
    }
    expect(slices[slices.length - 1].end).toBe(100);
  });

  it('appends a grey unspent remainder when under budget', () => {
    const slices = donutSlices(totals, 20000);
    expect(slices[slices.length - 1].color).toBe(UNSPENT_COLOR);
  });

  it('omits zero-value categories', () => {
    const slices = donutSlices(totals, 20000);
    expect(slices.some((s) => s.color === CATEGORY_COLORS.registration)).toBe(false);
  });

  it('adds no unspent slice when fully spent', () => {
    const slices = donutSlices(totals, 10000);
    expect(slices.some((s) => s.color === UNSPENT_COLOR)).toBe(false);
    expect(slices[slices.length - 1].end).toBeCloseTo(100, 10);
  });

  it('returns nothing for a zero denominator', () => {
    expect(donutSlices(totals, 0)).toEqual([]);
  });

  it('renders an all-grey ring when there is nothing to show', () => {
    expect(donutGradient([])).toBe(`conic-gradient(${UNSPENT_COLOR} 0 100%)`);
  });

  it('emits valid conic-gradient syntax', () => {
    const css = donutGradient(donutSlices(totals, 20000));
    expect(css.startsWith('conic-gradient(')).toBe(true);
    expect(css.endsWith(')')).toBe(true);
    expect(css).toContain(CATEGORY_COLORS.equipment);
  });
});

describe('averagePurchaseCents', () => {
  it('averages and rounds to whole cents', () => {
    expect(averagePurchaseCents([p(100), p(101)])).toBe(101);
  });

  it('returns 0 rather than NaN for an empty list', () => {
    expect(averagePurchaseCents([])).toBe(0);
  });
});

describe('costPerMemberCents', () => {
  it('divides spend across members', () => {
    expect(costPerMemberCents(2400000, 16)).toBe(150000);
  });

  it('returns 0 for a team with no members instead of dividing by zero', () => {
    expect(costPerMemberCents(500000, 0)).toBe(0);
    expect(Number.isFinite(costPerMemberCents(500000, 0))).toBe(true);
  });
});

describe('bigTicketPurchases', () => {
  const rows = [
    p(10000, { purchased_at: '2026-07-01T12:00:00Z', id: 'a' }),
    p(245000, { purchased_at: '2026-07-15T12:00:00Z', id: 'b' }),
    p(25000, { purchased_at: '2026-08-01T12:00:00Z', id: 'c' }),
    p(24999, { purchased_at: '2026-08-02T12:00:00Z', id: 'd' })
  ];

  it('includes purchases at exactly the threshold and excludes just below', () => {
    const ids = bigTicketPurchases(rows, 25000).map((r) => r.id);
    expect(ids).toContain('c');
    expect(ids).not.toContain('d');
  });

  it('sorts newest first', () => {
    expect(bigTicketPurchases(rows, 25000).map((r) => r.id)).toEqual(['c', 'b']);
  });

  it('respects the limit', () => {
    expect(bigTicketPurchases(rows, 25000, 1).map((r) => r.id)).toEqual(['c']);
  });

  it('returns an empty list when nothing qualifies', () => {
    expect(bigTicketPurchases(rows, 10_000_000)).toEqual([]);
  });

  it('does not mutate the input array order', () => {
    const before = rows.map((r) => r.id);
    bigTicketPurchases(rows, 0);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe('sumInDateRange', () => {
  const rows = [
    p(1000, { purchased_at: '2026-06-30T20:00:00Z' }),
    p(2000, { purchased_at: '2026-07-15T12:00:00Z' }),
    p(4000, { purchased_at: '2026-09-30T12:00:00Z' })
  ];

  it('includes both endpoints', () => {
    const only = [p(500, { purchased_at: '2026-07-15T12:00:00Z' })];
    expect(sumInDateRange(only, '2026-07-15', '2026-07-15', formatPacificDateKey)).toBe(500);
  });

  it('sums only rows inside the window', () => {
    expect(sumInDateRange(rows, '2026-07-01', '2026-08-31', formatPacificDateKey)).toBe(2000);
  });

  it('returns 0 when the window is undefined', () => {
    expect(sumInDateRange(rows, '', '', formatPacificDateKey)).toBe(0);
  });

  it('uses Pacific dates, so a late-UTC purchase lands on the prior local day', () => {
    // 2026-07-01T02:00:00Z is still June 30 in Pacific time.
    const late = [p(777, { purchased_at: '2026-07-01T02:00:00Z' })];
    expect(sumInDateRange(late, '2026-07-01', '2026-07-31', formatPacificDateKey)).toBe(0);
    expect(sumInDateRange(late, '2026-06-01', '2026-06-30', formatPacificDateKey)).toBe(777);
  });
});

describe('allocationSummary', () => {
  it('reports allocated, unallocated, and percent', () => {
    const summary = allocationSummary(7800000, [2500000, 1250000, 800000]);
    expect(summary.allocatedCents).toBe(4550000);
    expect(summary.unallocatedCents).toBe(3250000);
    expect(summary.allocationPercent).toBe(58);
    expect(summary.overAllocated).toBe(false);
  });

  it('never reports negative unallocated, but does flag over-allocation', () => {
    const summary = allocationSummary(100000, [80000, 50000]);
    expect(summary.unallocatedCents).toBe(0);
    expect(summary.overAllocated).toBe(true);
  });

  it('handles a club with no teams yet', () => {
    const summary = allocationSummary(100000, []);
    expect(summary.allocatedCents).toBe(0);
    expect(summary.unallocatedCents).toBe(100000);
    expect(summary.allocationPercent).toBe(0);
  });
});
