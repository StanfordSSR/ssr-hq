'use client';

import { useState } from 'react';
import { updateEoyReportSettingsAction } from '@/app/dashboard/actions';
import { type EoyQuestionConfig, type EoyReportSettings } from '@/lib/eoy-report-shared';

const QUESTION_LABELS: Array<{ key: keyof Omit<EoyQuestionConfig, 'acknowledgements'>; label: string }> = [
  { key: 'reregister', label: 'Q1 · Re-register prompt' },
  { key: 'nextLeads', label: 'Q2 · Next-year leads prompt' },
  { key: 'leadSelection', label: 'Q3 · Lead selection prompt' },
  { key: 'yearSummary', label: 'Q4 · Year summary prompt' },
  { key: 'classDistribution', label: 'Q5 · Class distribution prompt' },
  { key: 'niceToHave', label: 'Q6 · Nice-to-have prompt' },
  { key: 'summerActive', label: 'Summer · Activity prompt' },
  { key: 'summerMembers', label: 'Summer · On-campus members prompt' },
  { key: 'summerSpend', label: 'Summer · Predicted spend prompt' },
  { key: 'summerPlan', label: 'Summer · Major expenses prompt' },
  { key: 'summerJustifications', label: 'Summer · Justifications prompt' }
];

export function EoySettingsForm({
  settings,
  readOnly = false,
  canEdit = true
}: {
  settings: EoyReportSettings;
  readOnly?: boolean;
  // When false, render the read-only summary instead of the editable form. Used
  // to keep vice presidents (and any non-editor) from changing EOY settings.
  canEdit?: boolean;
}) {
  const [questions, setQuestions] = useState<EoyQuestionConfig>(settings.questions);

  const setPrompt = (key: keyof EoyQuestionConfig, value: string) =>
    setQuestions((current) => ({ ...current, [key]: value }));

  const setAcknowledgement = (index: number, value: string) =>
    setQuestions((current) => ({
      ...current,
      acknowledgements: current.acknowledgements.map((entry, entryIndex) => (entryIndex === index ? value : entry))
    }));

  const addAcknowledgement = () =>
    setQuestions((current) => ({ ...current, acknowledgements: [...current.acknowledgements, ''] }));

  const removeAcknowledgement = (index: number) =>
    setQuestions((current) => ({
      ...current,
      acknowledgements: current.acknowledgements.filter((_, entryIndex) => entryIndex !== index)
    }));

  if (readOnly || !canEdit) {
    return (
      <div className="hq-summary-list">
        <div className="hq-summary-row">
          <span>Due date</span>
          <strong>{settings.dueMonthDay}</strong>
        </div>
        <div className="hq-summary-row">
          <span>Email reminders</span>
          <strong>{settings.emailEnabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="hq-summary-row">
          <span>Slack reminders</span>
          <strong>{settings.slackEnabled ? 'Enabled' : 'Disabled'}</strong>
        </div>
        <div className="hq-summary-row">
          <span>Reminder cadence</span>
          <strong>{settings.reminderDays.map((day) => `${day} days before`).join(', ')}</strong>
        </div>
      </div>
    );
  }

  return (
    <form action={updateEoyReportSettingsAction} className="form-stack">
      <input type="hidden" name="eoy_questions_json" value={JSON.stringify(questions)} />

      <div className="hq-inline-grid">
        <div className="field">
          <label className="label" htmlFor="eoy-due-month-day">
            Due date (MM-DD)
          </label>
          <input
            className="input"
            id="eoy-due-month-day"
            name="eoy_due_month_day"
            placeholder="06-20"
            defaultValue={settings.dueMonthDay}
            required
          />
        </div>
      </div>

      <label className="hq-switch">
        <input type="checkbox" name="eoy_email_enabled" defaultChecked={settings.emailEnabled} />
        <span className="hq-switch-track" aria-hidden="true" />
        <span className="hq-switch-copy">
          <strong>Email team leads</strong>
          <small>Send year-end report reminders alongside in-portal nudges.</small>
        </span>
      </label>

      <label className="hq-switch">
        <input type="checkbox" name="eoy_slack_enabled" defaultChecked={settings.slackEnabled} />
        <span className="hq-switch-track" aria-hidden="true" />
        <span className="hq-switch-copy">
          <strong>Also send Slack DMs</strong>
          <small>Push reminders to linked Slack accounts through the HQ bot.</small>
        </span>
      </label>

      <div className="hq-inline-grid">
        <div className="field">
          <label className="label" htmlFor="eoy-reminder-one">
            Reminder 1
          </label>
          <input
            className="input"
            id="eoy-reminder-one"
            name="eoy_reminder_day_one"
            type="number"
            min="1"
            max="365"
            defaultValue={settings.reminderDays[0] || ''}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="eoy-reminder-two">
            Reminder 2
          </label>
          <input
            className="input"
            id="eoy-reminder-two"
            name="eoy_reminder_day_two"
            type="number"
            min="1"
            max="365"
            defaultValue={settings.reminderDays[1] || ''}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="eoy-reminder-three">
            Reminder 3
          </label>
          <input
            className="input"
            id="eoy-reminder-three"
            name="eoy_reminder_day_three"
            type="number"
            min="1"
            max="365"
            defaultValue={settings.reminderDays[2] || ''}
          />
        </div>
      </div>

      <div className="eoy-settings-questions">
        <span className="helper">
          Prompts support <code>{'{team}'}</code> and <code>{'{nextYear}'}</code> tokens.
        </span>
        {QUESTION_LABELS.map(({ key, label }) => (
          <div key={key} className="field">
            <label className="label" htmlFor={`eoy-q-${key}`}>
              {label}
            </label>
            <textarea
              className="input hq-textarea"
              id={`eoy-q-${key}`}
              rows={2}
              value={questions[key]}
              onChange={(event) => setPrompt(key, event.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="eoy-settings-questions">
        <div className="hq-block-head">
          <h4>Summer acknowledgements</h4>
          <button type="button" className="hq-inline-link hq-inline-link-accent" onClick={addAcknowledgement}>
            + Add acknowledgement
          </button>
        </div>
        {questions.acknowledgements.map((acknowledgement, index) => (
          <div key={index} className="eoy-ack-edit">
            <textarea
              className="input hq-textarea"
              rows={2}
              value={acknowledgement}
              onChange={(event) => setAcknowledgement(index, event.target.value)}
            />
            <button
              type="button"
              className="button-secondary eoy-ack-remove"
              onClick={() => removeAcknowledgement(index)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="button-row">
        <button className="button" type="submit">
          Save year-end report settings
        </button>
      </div>
    </form>
  );
}
