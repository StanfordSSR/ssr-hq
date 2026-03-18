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

const DAY_MS = 24 * 60 * 60 * 1000;

const makeDate = (value: string) => new Date(`${value}T12:00:00-08:00`);

const quarterBase = [
  { quarter: 'Autumn Quarter', start: '2025-09-22', end: '2025-12-12' },
  { quarter: 'Winter Quarter', start: '2026-01-05', end: '2026-03-20' },
  { quarter: 'Spring Quarter', start: '2026-03-30', end: '2026-06-10' },
  { quarter: 'Summer Quarter', start: '2026-06-22', end: '2026-08-15' }
];

export const REPORTING_WINDOWS: ReportingWindow[] = quarterBase.map((entry) => {
  const start = makeDate(entry.start);
  const end = makeDate(entry.end);

  return {
    academicYear: '2025-26',
    quarter: entry.quarter,
    start,
    end,
    openAt: new Date(end.getTime() - 21 * DAY_MS),
    dueAt: new Date(end.getTime() + 7 * DAY_MS)
  };
});

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

  if (days === 0) {
    return 'today';
  }

  if (days === 1) {
    return '1 day';
  }

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

export function getReportingWindow(academicYear: string, quarter: string) {
  return REPORTING_WINDOWS.find((window) => window.academicYear === academicYear && window.quarter === quarter) ?? null;
}

export function getNextReportState(now = new Date()): NextReportState {
  const currentWindow =
    REPORTING_WINDOWS.find((window) => now >= window.start && now <= window.end) ?? null;

  for (const window of REPORTING_WINDOWS) {
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

  const fallback = REPORTING_WINDOWS[REPORTING_WINDOWS.length - 1];

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
