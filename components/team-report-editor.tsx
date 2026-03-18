'use client';

import { useMemo, useState } from 'react';
import { saveTeamReportDraftAction, submitTeamReportAction } from '@/app/dashboard/actions';

type Question = {
  id: string;
  prompt: string;
  fieldType: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
  wordLimit: number;
  answer: string;
};

type TeamReportEditorProps = {
  teamId: string;
  academicYear: string;
  quarter: string;
  questions: Question[];
};

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function TeamReportEditor({ teamId, academicYear, quarter, questions }: TeamReportEditorProps) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(questions.map((question) => [question.id, question.answer]))
  );

  const wordCounts = useMemo(
    () =>
      Object.fromEntries(
        questions.map((question) => [question.id, countWords(answers[question.id] || '')])
      ),
    [answers, questions]
  );

  return (
    <form className="form-stack">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="academic_year" value={academicYear} />
      <input type="hidden" name="quarter" value={quarter} />

      <div className="hq-question-stack">
        {questions.map((question, index) => {
          const fieldName = `question_${question.id}`;
          const isAutoField = question.fieldType === 'member_count' || question.fieldType === 'funds_spent';

          return (
            <div key={question.id} className="hq-question-card">
              <div className="hq-block-head">
                <h3>Question {index + 1}</h3>
                <span className="hq-inline-note">{question.wordLimit} words max</span>
              </div>

              <p className="hq-question-prompt">{question.prompt}</p>

              {question.fieldType === 'short_text' || isAutoField ? (
                <input
                  className="input"
                  name={fieldName}
                  value={answers[question.id] || ''}
                  readOnly={isAutoField}
                  disabled={isAutoField}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                  }
                />
              ) : (
                <textarea
                  className="input hq-textarea"
                  name={fieldName}
                  value={answers[question.id] || ''}
                  rows={6}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value
                    }))
                  }
                />
              )}

              {isAutoField ? <input type="hidden" name={fieldName} value={answers[question.id] || ''} /> : null}
              <span className="helper">
                {isAutoField
                  ? question.fieldType === 'member_count'
                    ? 'Auto-filled from your current team member count.'
                    : 'Auto-filled from this quarter’s expense log.'
                  : `${wordCounts[question.id] || 0}/${question.wordLimit} words`}
              </span>
            </div>
          );
        })}
      </div>

      <div className="button-row">
        <button className="button-secondary" formAction={saveTeamReportDraftAction}>
          Save draft
        </button>
        <button className="button" formAction={submitTeamReportAction}>
          Submit report
        </button>
      </div>
    </form>
  );
}
