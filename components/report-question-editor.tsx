'use client';

import { useMemo, useState } from 'react';
import { saveReportQuestionsAction } from '@/app/dashboard/actions';

type Question = {
  id?: string;
  prompt: string;
  fieldType: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
  wordLimit: number;
};

type ReportQuestionEditorProps = {
  initialQuestions: Question[];
};

export function ReportQuestionEditor({ initialQuestions }: ReportQuestionEditorProps) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const serializedQuestions = useMemo(() => JSON.stringify(questions), [questions]);

  return (
    <form action={saveReportQuestionsAction} className="form-stack">
      <input type="hidden" name="questions_json" value={serializedQuestions} />

      <div className="hq-question-stack">
        {questions.map((question, index) => {
          const isAutoField = question.fieldType === 'member_count' || question.fieldType === 'funds_spent';

          return (
            <div key={question.id || `new-${index}`} className="hq-question-card">
              <div className="field">
                <label className="label" htmlFor={`report-question-${index}`}>
                  Question {index + 1}
                </label>
                <textarea
                  className="input hq-textarea"
                  id={`report-question-${index}`}
                  value={question.prompt}
                  onChange={(event) =>
                    setQuestions((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, prompt: event.target.value } : entry
                      )
                    )
                  }
                  rows={3}
                />
              </div>

              <div className="hq-inline-grid">
                <div className="field">
                  <label className="label" htmlFor={`report-question-type-${index}`}>
                    Response type
                  </label>
                  <select
                    className="select"
                    id={`report-question-type-${index}`}
                    value={question.fieldType}
                    disabled={isAutoField}
                    onChange={(event) =>
                      setQuestions((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                fieldType: event.target.value as 'short_text' | 'long_text' | 'member_count' | 'funds_spent'
                              }
                            : entry
                        )
                      )
                    }
                  >
                    <option value="long_text">Long text</option>
                    <option value="short_text">Short text</option>
                    <option value="member_count">Auto-fill member count</option>
                    <option value="funds_spent">Auto-fill funds spent</option>
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor={`report-question-limit-${index}`}>
                    Word limit
                  </label>
                  <input
                    className="input"
                    id={`report-question-limit-${index}`}
                    type="number"
                    min="1"
                    max="5000"
                    value={question.wordLimit}
                    onChange={(event) =>
                      setQuestions((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                wordLimit: Math.max(1, Number(event.target.value) || 1)
                              }
                            : entry
                        )
                      )
                    }
                  />
                </div>
              </div>

              {!isAutoField ? (
                <div className="hq-inline-editor-actions">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() =>
                      setQuestions((current) => current.filter((_, entryIndex) => entryIndex !== index))
                    }
                  >
                    Remove question
                  </button>
                </div>
              ) : (
                <span className="helper">
                  {question.fieldType === 'member_count'
                    ? 'This question stays on the form and auto-fills from the team roster count.'
                    : 'This question stays on the form and auto-fills from the team’s quarter spend.'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="button-row">
        <button
          className="button-secondary"
          type="button"
          onClick={() =>
            setQuestions((current) => [
              ...current,
              {
                prompt: '',
                fieldType: 'long_text',
                wordLimit: 150
              }
            ])
          }
        >
          Add question
        </button>
        <button className="button" type="submit">
          Save questions
        </button>
      </div>
    </form>
  );
}
