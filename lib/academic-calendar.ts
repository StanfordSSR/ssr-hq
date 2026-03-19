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

export type AcademicCalendarTemplate = {
  autumnStartMonthDay: string;
  autumnEndMonthDay: string;
  winterEndMonthDay: string;
  springEndMonthDay: string;
  summerEndMonthDay: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TEMPLATE: AcademicCalendarTemplate = {
  autumnStartMonthDay: '09-22',
  autumnEndMonthDay: '12-12',
  winterEndMonthDay: '03-20',
  springEndMonthDay: '06-10',
  summerEndMonthDay: '08-15'
};

function makeLocalDate(year: number, monthDay: string) {
  return new Date(`${year}-${monthDay}T12:00:00-08:00`);
}

function dayAfter(date: Date) {
  return new Date(date.getTime() + DAY_MS);
}

function formatAcademicYearFromStartYear(startYear: number) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function parseAcademicYearStartYear(academicYear: string) {
  const parsed = Number(academicYear.slice(0, 4));
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAcademicYear(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 8 ? year : year - 1;
  return formatAcademicYearFromStartYear(startYear);
}

export function getNextAcademicYear(academicYear: string) {
  const startYear = parseAcademicYearStartYear(academicYear);
  if (startYear === null) {
    return academicYear;
  }

  return formatAcademicYearFromStartYear(startYear + 1);
}

export function getPreviousAcademicYear(academicYear: string) {
  const startYear = parseAcademicYearStartYear(academicYear);
  if (startYear === null) {
    return academicYear;
  }

  return formatAcademicYearFromStartYear(startYear - 1);
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

function isMonthDay(value: string) {
  return /^\d{2}-\d{2}$/.test(value);
}

export async function getAcademicCalendarTemplate(): Promise<AcademicCalendarTemplate> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('academic_calendar_templates')
    .select('autumn_start_md, autumn_end_md, winter_end_md, spring_end_md, summer_end_md')
    .eq('id', 1)
    .maybeSingle();

  if (!data) {
    return DEFAULT_TEMPLATE;
  }

  return {
    autumnStartMonthDay: isMonthDay(data.autumn_start_md) ? data.autumn_start_md : DEFAULT_TEMPLATE.autumnStartMonthDay,
    autumnEndMonthDay: isMonthDay(data.autumn_end_md) ? data.autumn_end_md : DEFAULT_TEMPLATE.autumnEndMonthDay,
    winterEndMonthDay: isMonthDay(data.winter_end_md) ? data.winter_end_md : DEFAULT_TEMPLATE.winterEndMonthDay,
    springEndMonthDay: isMonthDay(data.spring_end_md) ? data.spring_end_md : DEFAULT_TEMPLATE.springEndMonthDay,
    summerEndMonthDay: isMonthDay(data.summer_end_md) ? data.summer_end_md : DEFAULT_TEMPLATE.summerEndMonthDay
  };
}

function getAcademicYearStartYear(now: Date, template: AcademicCalendarTemplate) {
  const year = now.getFullYear();
  const thisYearBoundary = dayAfter(makeLocalDate(year, template.summerEndMonthDay));
  return now >= thisYearBoundary ? year : year - 1;
}

function buildWindowsForStartYear(startYear: number, template: AcademicCalendarTemplate): ReportingWindow[] {
  const autumnStart = makeLocalDate(startYear, template.autumnStartMonthDay);
  const autumnEnd = makeLocalDate(startYear, template.autumnEndMonthDay);
  const winterEnd = makeLocalDate(startYear + 1, template.winterEndMonthDay);
  const springEnd = makeLocalDate(startYear + 1, template.springEndMonthDay);
  const summerEnd = makeLocalDate(startYear + 1, template.summerEndMonthDay);
  const academicYear = formatAcademicYearFromStartYear(startYear);

  const rows = [
    { quarter: 'Autumn Quarter', start: autumnStart, end: autumnEnd },
    { quarter: 'Winter Quarter', start: dayAfter(autumnEnd), end: winterEnd },
    { quarter: 'Spring Quarter', start: dayAfter(winterEnd), end: springEnd },
    { quarter: 'Summer Quarter', start: dayAfter(springEnd), end: summerEnd }
  ];

  return rows.map((row) => ({
    academicYear,
    quarter: row.quarter,
    start: row.start,
    end: row.end,
    openAt: new Date(row.end.getTime() - 21 * DAY_MS),
    dueAt: new Date(row.end.getTime() + 7 * DAY_MS)
  }));
}

export async function getCurrentAcademicYear(now = new Date()) {
  const template = await getAcademicCalendarTemplate();
  return formatAcademicYearFromStartYear(getAcademicYearStartYear(now, template));
}

export async function getReportingWindows(academicYear?: string) {
  const template = await getAcademicCalendarTemplate();
  let startYear = getAcademicYearStartYear(new Date(), template);
  if (academicYear) {
    const parsed = Number(academicYear.slice(0, 4));
    if (Number.isFinite(parsed)) {
      startYear = parsed;
    }
  }
  return buildWindowsForStartYear(startYear, template);
}

export async function getReportingWindow(academicYear: string, quarter: string) {
  const windows = await getReportingWindows(academicYear);
  return windows.find((window) => window.quarter === quarter) ?? null;
}

export async function getNextReportState(now = new Date()): Promise<NextReportState> {
  const template = await getAcademicCalendarTemplate();
  const startYear = getAcademicYearStartYear(now, template);
  const windows = buildWindowsForStartYear(startYear, template);
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

  const nextWindows = buildWindowsForStartYear(startYear + 1, template);
  const upcoming = nextWindows[0]!;
  return {
    academicYear: upcoming.academicYear,
    currentQuarter: 'Between quarters',
    quarterStatus: 'break',
    reportState: 'upcoming',
    targetQuarter: upcoming.quarter,
    openAt: upcoming.openAt,
    dueAt: upcoming.dueAt,
    message: `Reporting opens on ${formatDateLabel(upcoming.openAt)}.`,
    countdownLabel: formatCountdown(upcoming.openAt, now)
  };
}
