import { getNextReportState, type NextReportState } from '@/lib/academic-calendar';

export type ReportQuestion = {
  id: string;
  prompt: string;
  fieldType: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
  wordLimit: number;
  sortOrder: number;
};

export type EditableReportQuestion = {
  id?: string;
  prompt: string;
  fieldType: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
  wordLimit: number;
  sortOrder: number;
};

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeReportQuestions(value: unknown) {
  const parsed = Array.isArray(value) ? value : [];
  const cleaned = parsed
    .map((question, index) => {
      if (!question || typeof question !== 'object') {
        return null;
      }

      const record = question as Record<string, unknown>;
      const id = String(record.id || '').trim();
      const prompt = String(record.prompt || '').trim();
      const fieldType = String(record.fieldType || '').trim();
      const wordLimit = Number(record.wordLimit || 0);

      if (!prompt) {
        return null;
      }

      if (
        fieldType !== 'short_text' &&
        fieldType !== 'long_text' &&
        fieldType !== 'member_count' &&
        fieldType !== 'funds_spent'
      ) {
        return null;
      }

      if (!Number.isInteger(wordLimit) || wordLimit <= 0 || wordLimit > 5000) {
        return null;
      }

      return {
        id: id || undefined,
        prompt,
        fieldType,
        wordLimit,
        sortOrder: index
      } satisfies EditableReportQuestion;
    })
    .filter(Boolean) as EditableReportQuestion[];

  if (!cleaned.some((question) => question.fieldType === 'member_count')) {
    cleaned.unshift({
      id: undefined,
      prompt: 'Team member count',
      fieldType: 'member_count',
      wordLimit: 25,
      sortOrder: 0
    });
  }

  if (!cleaned.some((question) => question.fieldType === 'funds_spent')) {
    cleaned.splice(1, 0, {
      id: undefined,
      prompt: 'Funds spent this quarter',
      fieldType: 'funds_spent',
      wordLimit: 30,
      sortOrder: 1
    });
  }

  return cleaned.map((question, index) => ({
    ...question,
    sortOrder: index
  }));
}

export async function getOpenReportContext(now = new Date()) {
  const reportState = await getNextReportState(now);
  return {
    reportState,
    canSubmit: reportState.reportState === 'open'
  };
}

export function formatQuarterKey(reportState: NextReportState) {
  return {
    academicYear: reportState.academicYear,
    quarter: reportState.targetQuarter
  };
}

export function formatQuarterLabel(quarter: string) {
  return quarter.replace('Autumn', 'Fall');
}

export function formatQuarterReportTitle(quarter: string) {
  return `${formatQuarterLabel(quarter).replace(/ Quarter$/, ' quarter')} report`;
}
