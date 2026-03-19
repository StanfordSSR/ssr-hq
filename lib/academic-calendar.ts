import { createAdminClient } from '@/lib/supabase-admin';

export type ReportingWindow = {
  academicYear: string;
  quarter: string;
  start: Date;
  end: Date;
  openAt: Date;
  dueAt: Date;
};

export type NextReportState = {
  academicYear: string;
  currentQuarter: string;
  quarterStatus: 'in_session' | 'break';
  reportState: 'open' | 'upcoming' | 'closed';
  targetQuarter: string;
  openAt: Date;
  dueAt: Date;
  message: string;
  countdownLabel: string;
};

type QuarterRow = {
  academic_year: string;
  quarter: string;
  start_date: string;
  end_date: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const QUARTER_ORDER = ['Autumn Quarter', 'Winter Quarter', 'Spring Quarter', 'Summer Quarter'] as const;
const DEFAULT_ACADEMIC_YEAR = '2025-26';
const DEFAULT_ROWS: QuarterRow[] = [
  { academic_year: '2025-26', quarter: 'Autumn Quarter', start_date: '2025-09-22', end_date: '2025-12-12' },
  { academic_year: '2025-26', quarter: 'Winter Quarter', start_date: '2026-01-05', end_date: '2026-03-20' },
  { academic_year: '2025-26', quarter: 'Spring Quarter', start_date: '2026-03-30', end_date: '2026-06-10' },
  { academic_year: '2025-26', quarter: 'Summer Quarter', start_date: '2026-06-22', end_date: '2026-08-15' }
];

const makeDate = (value: string) => new Date(`${value}T12:00:00-08:00`);

export function formatAcademicYear(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 8 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

export function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function formatCountdown(target: Date, now: Date) {
  const diff = target.getTime() - now.getTime();
  const days = Math.max(0, Math.ceil(diff / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function formatPacificDateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function getCalendarRows(academicYear?: string) {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('academic_calendar_settings')
    .select('current_academic_year')
    .eq('id', 1)
    .maybeSingle();

  const cycle = academicYear || settings?.current_academic_year || DEFAULT_ACADEMIC_YEAR;
  const { data } = await admin
    .from('academic_quarter_ranges')
    .select('academic_year, quarter, start_date, end_date')
    .eq('academic_year', cycle)
    .order('sort_order');

  const rows = ((data || []) as QuarterRow[]).length > 0
    ? (data as QuarterRow[])
    : DEFAULT_ROWS.filter((row) => row.academic_year === cycle || cycle === DEFAULT_ACADEMIC_YEAR);

  return {
    academicYear: cycle,
    rows: rows.sort((a, b) => QUARTER_ORDER.indexOf(a.quarter as (typeof QUARTER_ORDER)[number]) - QUARTER_ORDER.indexOf(b.quarter as (typeof QUARTER_ORDER)[number]))
  };
}

function toReportingWindow(row: QuarterRow): ReportingWindow {
  const start = makeDate(row.start_date);
  const end = makeDate(row.end_date);
  return {
    academicYear: row.academic_year,
    quarter: row.quarter,
    start,
    end,
    openAt: new Date(end.getTime() - 21 * DAY_MS),
    dueAt: new Date(end.getTime() + 7 * DAY_MS)
  };
}

export async function getCurrentAcademicYear() {
  const { academicYear } = await getCalendarRows();
  return academicYear;
}

export async function getReportingWindows(academicYear?: string) {
  const { rows } = await getCalendarRows(academicYear);
  return rows.map(toReportingWindow);
}

export async function getReportingWindow(academicYear: string, quarter: string) {
  const windows = await getReportingWindows(academicYear);
  return windows.find((window) => window.quarter === quarter) ?? null;
}

export async function getNextReportState(now = new Date()): Promise<NextReportState> {
  const { academicYear } = await getCalendarRows();
  const windows = await getReportingWindows(academicYear);
  const currentWindow = windows.find((window) => now >= window.start && now <= window.end) ?? null;

  for (const window of windows) {
    if (now < window.openAt) {
      return {
        academicYear: window.academicYear,
        currentQuarter: currentWindow?.quarter || 'Between quarters',
        quarterStatus: currentWindow ? 'in_session' : 'break',
        reportState: 'upcoming',
        targetQuarter: window.quarter,
        openAt: window.openAt,
        dueAt: window.dueAt,
        message: `Reporting opens on ${formatDateLabel(window.openAt)}.`,
        countdownLabel: formatCountdown(window.openAt, now)
      };
    }

    if (now <= window.dueAt) {
      return {
        academicYear: window.academicYear,
        currentQuarter: currentWindow?.quarter || window.quarter,
        quarterStatus: currentWindow ? 'in_session' : 'break',
        reportState: 'open',
        targetQuarter: window.quarter,
        openAt: window.openAt,
        dueAt: window.dueAt,
        message: `Report submission is open for ${window.quarter} and is due by ${formatDateLabel(window.dueAt)}.`,
        countdownLabel: formatCountdown(window.dueAt, now)
      };
    }
  }

  const fallback = windows[windows.length - 1] || toReportingWindow(DEFAULT_ROWS[DEFAULT_ROWS.length - 1]!);
  return {
    academicYear: fallback.academicYear,
    currentQuarter: 'Between quarters',
    quarterStatus: 'break',
    reportState: 'closed',
    targetQuarter: fallback.quarter,
    openAt: fallback.openAt,
    dueAt: fallback.dueAt,
    message: `The ${fallback.quarter} reporting window closed on ${formatDateLabel(fallback.dueAt)}.`,
    countdownLabel: 'closed'
  };
}
