// Pure constants, types, and helpers for the end-of-year report.
// Kept free of server-only imports so client components can use them.

export const EOY_REPORT_TITLE = 'End of year report and summer plans';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const OPEN_WINDOW_DAYS = 45;
export const BUDGET_WORD_THRESHOLD_CENTS = 10_000 * 100;

export type EoyAcknowledgement = string;

export type EoyQuestionConfig = {
  reregister: string;
  nextLeads: string;
  leadSelection: string;
  yearSummary: string;
  classDistribution: string;
  niceToHave: string;
  summerActive: string;
  summerMembers: string;
  summerSpend: string;
  summerPlan: string;
  summerJustifications: string;
  acknowledgements: EoyAcknowledgement[];
};

export type EoyReportSettings = {
  dueMonthDay: string;
  emailEnabled: boolean;
  slackEnabled: boolean;
  reminderDays: number[];
  questions: EoyQuestionConfig;
};

export type EoyReportState = {
  academicYear: string;
  nextAcademicYear: string;
  reportState: 'open' | 'upcoming' | 'closed';
  openAt: Date;
  dueAt: Date;
  message: string;
  countdownLabel: string;
};

export type EoyMemberRef = {
  id: string;
  name: string;
  source: 'profile' | 'roster';
};

export type EoyClassDistribution = {
  frosh: number;
  soph: number;
  junior: number;
  senior: number;
  masters: number;
  phd: number;
};

export type EoySummerJustification = {
  category: string;
  justification: string;
};

export type EoyReportData = {
  reregister: 'yes' | 'no' | '';
  nextLeads: EoyMemberRef[];
  leadSelection: string;
  yearSummary: string;
  classDistribution: EoyClassDistribution;
  niceToHave: string[];
  summer: {
    active: 'yes' | 'no' | '';
    members: EoyMemberRef[];
    predictedSpendCents: number;
    plan: string;
    justifications: EoySummerJustification[];
    acknowledgements: boolean[];
  };
  // Team lead's hand-drawn signature, stored as a PNG data URL.
  signature: string;
  // Snapshot of auto-filled values at the time of the last save.
  autofill: {
    totalMembers: number;
    fundsSpentThisYearCents: number;
    annualBudgetCents: number;
    remainingFundingCents: number;
  };
};

export const EOY_CLASS_YEARS: Array<{ key: keyof EoyClassDistribution; label: string; tone: string }> = [
  { key: 'frosh', label: 'Frosh', tone: '#8c1515' },
  { key: 'soph', label: 'Sophomore', tone: '#b83a2b' },
  { key: 'junior', label: 'Junior', tone: '#d98324' },
  { key: 'senior', label: 'Senior', tone: '#2f7d5b' },
  { key: 'masters', label: 'Masters / Coterm', tone: '#2563a8' },
  { key: 'phd', label: 'PhD+', tone: '#5b3a86' }
];

// Summer spending categories that require a written justification.
export const EOY_JUSTIFICATION_CATEGORIES = ['Food', 'Registration', 'Travel'] as const;

export const DEFAULT_EOY_QUESTIONS: EoyQuestionConfig = {
  reregister:
    'Would you like to re-register {team} for the {nextYear} academic year? Confirming means your team intends to keep operating with active leadership next year.',
  nextLeads:
    'Who will lead {team} next year? Select the two members who will serve as team leads for {nextYear}.',
  leadSelection: 'In a few sentences, tell us how these leads were chosen or nominated.',
  yearSummary:
    "Looking back on the year, summarize {team}'s most significant work, achievements, and sub-team milestones.",
  classDistribution:
    'Roughly how is {team} distributed across class years? Drag the markers to set the approximate share of each year.',
  niceToHave:
    'Is there anything that would help {team} next year that the robotics club could provide — equipment, shared software, space, and so on? List up to three.',
  summerActive:
    'Does {team} plan to stay active over the summer? Spending funds over the summer requires at least two members who will regularly be on campus.',
  summerMembers: 'Which two members will regularly be on campus over the summer?',
  summerSpend: 'About how much funding do you expect {team} to spend over the summer?',
  summerPlan:
    "Describe the major expenses you're planning for the summer and how the funds will be used.",
  summerJustifications:
    'For any spending that is not equipment or pre-approved travel (for example food, registration, or travel), give a short justification for each category below. Note: food for team meetings requires at least three members present, and summer food spending is discouraged as it is difficult to justify to the ASSU.',
  acknowledgements: [
    "Purchasing or reimbursing parts to work on at a team member's private residence is prohibited. If you ship something using a credit card, reimbursement, or our Amazon account to a location outside of Stanford, you must get approval from a president and justify why it is required (allowed reasons include buying something you would otherwise not be able to purchase at Stanford or during the regular academic year).",
    'I understand reimbursements may take longer than usual over summer.',
    'Receipts for credit card purchases must be logged to HQ or otherwise provided to the FOs within 1 week of purchase. Failure to provide a receipt will bar your team from spending funds over summer.',
    "Teams spending money over summer must log their purchases to Stanford SSR HQ in a timely manner. Failure to do so may result in a bar from summer spending and may compromise your team's funding in the next academic year.",
    'Large purchases (over $500) not listed in the major-expenses question above must be approved by a president or VP.',
    'Outside of approved competition travel, food and travel funding should never be used outside the state of California without explicit approval. Food and travel within California must follow the guidelines listed above.',
    'Using equipment belonging to the robotics club over summer that you or your members are not trained for is prohibited. Specifically, soldering must never happen in the robotics room (outside of teams that have specific SOPs for this and have invested in adequate air ventilation for soldering). Use of printers is reliant on having Lab64 training. Using robotics club equipment for which you are not trained that results in damages is personally liable.'
  ]
};

export function emptyEoyReportData(): EoyReportData {
  return {
    reregister: '',
    nextLeads: [],
    leadSelection: '',
    yearSummary: '',
    classDistribution: { frosh: 25, soph: 25, junior: 20, senior: 20, masters: 7, phd: 3 },
    niceToHave: ['', '', ''],
    summer: {
      active: '',
      members: [],
      predictedSpendCents: 0,
      plan: '',
      justifications: [],
      acknowledgements: DEFAULT_EOY_QUESTIONS.acknowledgements.map(() => false)
    },
    signature: '',
    autofill: {
      totalMembers: 0,
      fundsSpentThisYearCents: 0,
      annualBudgetCents: 0,
      remainingFundingCents: 0
    }
  };
}

export function isMonthDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}-\d{2}$/.test(value);
}

export function parseStartYear(academicYear: string) {
  const parsed = Number(academicYear.slice(0, 4));
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

export function mergeQuestions(stored: unknown): EoyQuestionConfig {
  const record = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};
  const pick = (key: keyof EoyQuestionConfig) => {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : (DEFAULT_EOY_QUESTIONS[key] as string);
  };

  const storedAcks = Array.isArray(record.acknowledgements)
    ? (record.acknowledgements as unknown[]).map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  return {
    reregister: pick('reregister'),
    nextLeads: pick('nextLeads'),
    leadSelection: pick('leadSelection'),
    yearSummary: pick('yearSummary'),
    classDistribution: pick('classDistribution'),
    niceToHave: pick('niceToHave'),
    summerActive: pick('summerActive'),
    summerMembers: pick('summerMembers'),
    summerSpend: pick('summerSpend'),
    summerPlan: pick('summerPlan'),
    summerJustifications: pick('summerJustifications'),
    acknowledgements: storedAcks.length > 0 ? storedAcks : DEFAULT_EOY_QUESTIONS.acknowledgements
  };
}

export function getEoyWindow(academicYear: string, dueMonthDay: string) {
  const startYear = parseStartYear(academicYear);
  const dueAt = new Date(`${startYear + 1}-${dueMonthDay}T12:00:00-08:00`);
  const openAt = new Date(dueAt.getTime() - OPEN_WINDOW_DAYS * DAY_MS);
  return { openAt, dueAt };
}

// Q4 word limit depends on the team's annual budget.
export function yearSummaryWordLimit(annualBudgetCents: number) {
  return annualBudgetCents > BUDGET_WORD_THRESHOLD_CENTS ? 500 : 250;
}

// Summer expense description recommended word limit depends on predicted spend.
export function summerPlanWordLimit(predictedSpendCents: number) {
  if (predictedSpendCents > 2500 * 100) return 300;
  if (predictedSpendCents >= 1000 * 100) return 150;
  return 75;
}

export function formatEoyCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export function applyEoyTokens(prompt: string, tokens: { team?: string; nextYear?: string }) {
  return prompt
    .replace(/\{team\}/g, tokens.team || 'your team')
    .replace(/\{nextYear\}/g, tokens.nextYear || 'next year');
}

export function applyEoyQuestionTokens(
  questions: EoyQuestionConfig,
  tokens: { team?: string; nextYear?: string }
): EoyQuestionConfig {
  return {
    ...questions,
    reregister: applyEoyTokens(questions.reregister, tokens),
    nextLeads: applyEoyTokens(questions.nextLeads, tokens),
    leadSelection: applyEoyTokens(questions.leadSelection, tokens),
    yearSummary: applyEoyTokens(questions.yearSummary, tokens),
    classDistribution: applyEoyTokens(questions.classDistribution, tokens),
    niceToHave: applyEoyTokens(questions.niceToHave, tokens),
    summerActive: applyEoyTokens(questions.summerActive, tokens),
    summerMembers: applyEoyTokens(questions.summerMembers, tokens),
    summerSpend: applyEoyTokens(questions.summerSpend, tokens),
    summerPlan: applyEoyTokens(questions.summerPlan, tokens),
    summerJustifications: applyEoyTokens(questions.summerJustifications, tokens),
    acknowledgements: questions.acknowledgements.map((entry) => applyEoyTokens(entry, tokens))
  };
}

export function eoyMemberKey(ref: { id: string; source: string }) {
  return `${ref.source}:${ref.id}`;
}

export function countEoyWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}
