'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { saveTeamBudgetApplicationAction } from '@/app/dashboard/teams/[id]/budget-application/actions';
import {
  BUDGET_CATEGORIES,
  BUDGET_CATEGORY_LABELS,
  formatBudgetMoney,
  getCategoryRequest,
  getSubmissionError,
  type BudgetApplicationItem,
  type BudgetCaps,
  type BudgetCategory
} from '@/lib/team-budget-application-rules';

type EditorRow = {
  id: string;
  category: BudgetCategory;
  description: string;
  amount: string;
};

function initialRows(items: BudgetApplicationItem[], canEdit: boolean, caps: BudgetCaps): EditorRow[] {
  const rows = items.map((item) => ({
    id: item.id,
    category: item.category,
    description: item.description,
    amount: (item.amountCents / 100).toFixed(2)
  }));
  if (canEdit) {
    for (const category of BUDGET_CATEGORIES) {
      if (category !== 'food' && caps[category] > 0 && !rows.some((row) => row.category === category)) {
        rows.push({ id: `empty-${category}`, category, description: '', amount: '' });
      }
    }
  }
  return rows;
}

function parseRows(rows: EditorRow[], allowedZeroIds: ReadonlySet<string>): { items: BudgetApplicationItem[]; error: string | null } {
  const items: BudgetApplicationItem[] = [];
  for (const row of rows) {
    const description = row.description.trim();
    const amount = row.amount.trim();
    if (!description && !amount) continue;
    if (!description) return { items, error: `${BUDGET_CATEGORY_LABELS[row.category]} has a line without a description.` };
    if (description.length > 160) return { items, error: 'Line descriptions must be 160 characters or fewer.' };
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      return { items, error: `${BUDGET_CATEGORY_LABELS[row.category]} has an invalid amount.` };
    }
    const amountCents = Math.round(Number(amount) * 100);
    if ((amountCents < 1 && !(amountCents === 0 && row.category === 'travel' && allowedZeroIds.has(row.id))) || amountCents > 100_000_000) {
      return { items, error: 'Each line amount must be between $0.01 and $1,000,000, except approved $0 travel lines.' };
    }
    items.push({ id: row.id, category: row.category, description, amountCents });
  }
  return { items, error: null };
}

function formatSavedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/Los_Angeles', timeZoneName: 'short'
  }).format(new Date(value));
}

export function TeamBudgetApplicationEditor({
  teamId,
  academicYear,
  caps,
  initialItems,
  fixedTravelItems,
  initialPrefillPending,
  initialVersion,
  initialStatus,
  initialUpdatedAt,
  canEdit
}: {
  teamId: string;
  academicYear: string;
  caps: BudgetCaps;
  initialItems: BudgetApplicationItem[];
  fixedTravelItems: BudgetApplicationItem[];
  initialPrefillPending: boolean;
  initialVersion: number;
  initialStatus: 'draft' | 'submitted';
  initialUpdatedAt: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() => initialRows(initialItems, canEdit && initialStatus === 'draft', caps));
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState(initialStatus);
  const [savedAt, setSavedAt] = useState(initialUpdatedAt);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(initialPrefillPending);
  const [hasConflict, setHasConflict] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = canEdit && status === 'draft';
  const allowedZeroIds = useMemo(
    () => new Set(fixedTravelItems.filter((item) => item.amountCents === 0).map((item) => item.id)),
    [fixedTravelItems]
  );
  const parsed = useMemo(() => parseRows(rows, allowedZeroIds), [rows, allowedZeroIds]);
  const submissionError = parsed.error || getSubmissionError(parsed.items, caps);
  const totalCents = parsed.items.reduce((sum, item) => sum + item.amountCents, 0);

  function changeRow(id: string, field: 'description' | 'amount', value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setHasUnsavedChanges(true);
    setFeedback(null);
  }

  function addRows(category: BudgetCategory, count: number) {
    setRows((current) => [
      ...current,
      ...Array.from({ length: Math.min(count, 200 - current.length) }, () => ({
        id: crypto.randomUUID(), category, description: '', amount: ''
      }))
    ]);
    setHasUnsavedChanges(true);
    setFeedback(null);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setHasUnsavedChanges(true);
    setFeedback(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === 'submit' ? 'submit' : 'draft';
    if (parsed.error || (intent === 'submit' && submissionError)) {
      setFeedback({ kind: 'error', message: parsed.error || submissionError || 'Check your line items.' });
      return;
    }
    if (intent === 'submit' && !window.confirm('Submit this annual budget application? It will become read-only.')) return;

    startTransition(async () => {
      try {
        const result = await saveTeamBudgetApplicationAction({
          teamId,
          academicYear,
          expectedVersion: version,
          intent,
          items: parsed.items
        });
        if (!result.ok) {
          if (result.code === 'conflict') setHasConflict(true);
          setFeedback({ kind: 'error', message: result.error });
          return;
        }
        setVersion(result.version);
        setStatus(result.status);
        setSavedAt(result.updatedAt);
        setHasUnsavedChanges(false);
        setHasConflict(false);
        setFeedback({ kind: 'success', message: result.status === 'submitted' ? 'Application submitted.' : 'Draft saved.' });
        router.refresh();
      } catch {
        setFeedback({ kind: 'error', message: 'Could not reach the server. Your entries are still here; try again.' });
      }
    });
  }

  return (
    <form className="budget-app-form" onSubmit={handleSubmit}>
      <div className="budget-app-overview">
        <div>
          <span className="budget-app-overview-label">Requested</span>
          <strong>{formatBudgetMoney(totalCents)}</strong>
        </div>
        <div>
          <span className="budget-app-overview-label">Line items</span>
          <strong>{parsed.items.length}</strong>
        </div>
        <div>
          <span className="budget-app-overview-label">Status</span>
          <strong>{status === 'submitted' ? 'Submitted' : 'Draft'}</strong>
          {editable ? (
            <span className="budget-app-save-state" aria-live="polite">
              {hasUnsavedChanges ? 'Unsaved changes' : savedAt ? `Saved ${formatSavedAt(savedAt)}` : 'Not saved yet'}
            </span>
          ) : null}
        </div>
      </div>

      {BUDGET_CATEGORIES.map((category) => {
        const categoryRows = rows.filter((row) => row.category === category);
        const categoryEditable = editable && category !== 'food' && !(category === 'travel' && fixedTravelItems.length > 0);
        const request = getCategoryRequest(parsed.items, category, caps);
        const blankRowsNeeded = Math.max(0, request.requiredItemCount - categoryRows.length);
        return (
          <section className="budget-app-category" key={category} aria-labelledby={`budget-app-${category}`}>
            <div className="budget-app-category-head">
              <div>
                <h2 id={`budget-app-${category}`}>{BUDGET_CATEGORY_LABELS[category]}</h2>
                <p>Cap {formatBudgetMoney(caps[category])}{category === 'food' || (category === 'travel' && fixedTravelItems.length > 0) ? ' · Fixed by club plan' : ''}</p>
              </div>
              <strong className={request.overLimit ? 'th-bad' : request.overCap ? 'th-warn' : undefined}>
                {formatBudgetMoney(request.totalCents)} requested
              </strong>
            </div>

            {request.overLimit ? (
              <p className="budget-app-notice budget-app-notice-error" role="alert">
                {formatBudgetMoney(request.totalCents - caps[category])} over the category cap. Reduce the request before submitting.
              </p>
            ) : request.overCap ? (
              <p className="budget-app-notice budget-app-notice-warning" role="status">
                {formatBudgetMoney(request.totalCents - caps[category])} over the category cap. Review this category before submitting.
              </p>
            ) : null}
            {request.missingItems > 0 ? (
              <p className="budget-app-notice budget-app-notice-warning" role="status">
                Add {request.missingItems} more line item{request.missingItems === 1 ? '' : 's'}; average no more than {formatBudgetMoney(request.lineItemTargetCents)} per line.
              </p>
            ) : null}

            {categoryRows.length > 0 ? (
              <div className="budget-app-lines">
                <div className="budget-app-line-head" aria-hidden="true">
                  <span>#</span>
                  <span>Line item</span>
                  <span>Amount</span>
                  <span />
                </div>
                {categoryRows.map((row, index) => (
                  <div className="budget-app-line" key={row.id}>
                    <span className="budget-app-line-number" aria-hidden="true">{index + 1}</span>
                    {categoryEditable ? (
                      <input
                        type="text"
                        aria-label={`${BUDGET_CATEGORY_LABELS[category]} line ${index + 1} description`}
                        value={row.description}
                        maxLength={160}
                        onChange={(event) => changeRow(row.id, 'description', event.target.value)}
                        placeholder="Item or grouped purpose"
                        disabled={isPending}
                      />
                    ) : <span className="budget-app-readonly">{row.description}</span>}
                    {categoryEditable ? (
                      <span className="budget-app-money-input">
                        <span>$</span>
                        <input
                          type="number"
                          aria-label={`${BUDGET_CATEGORY_LABELS[category]} line ${index + 1} amount`}
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(event) => changeRow(row.id, 'amount', event.target.value)}
                          disabled={isPending}
                        />
                      </span>
                    ) : <span className="budget-app-readonly budget-app-readonly-amount">{row.amount ? formatBudgetMoney(Math.round(Number(row.amount) * 100)) : ''}</span>}
                    {categoryEditable ? (
                      <button type="button" className="budget-app-remove" onClick={() => removeRow(row.id)} disabled={isPending} aria-label={`Remove ${BUDGET_CATEGORY_LABELS[category]} line ${index + 1}`}>
                        &times;
                      </button>
                    ) : <span aria-hidden="true" />}
                  </div>
                ))}
              </div>
            ) : <p className="empty-note">No {category} items.</p>}

            {categoryEditable && caps[category] > 0 ? (
              <div className="budget-app-add-actions">
                <button type="button" className="button-secondary" onClick={() => addRows(category, 1)} disabled={isPending || rows.length >= 200}>
                  Add line
                </button>
                {blankRowsNeeded > 1 ? (
                  <button type="button" className="button-secondary" onClick={() => addRows(category, blankRowsNeeded)} disabled={isPending || rows.length + blankRowsNeeded > 200}>
                    Add {blankRowsNeeded} lines
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}

      {editable ? (
        <div className="budget-app-actions">
          <div className="button-row">
            <button type="submit" className="button-secondary" name="intent" value="draft" disabled={isPending || hasConflict || Boolean(parsed.error)}>
              {isPending ? 'Saving...' : 'Save draft'}
            </button>
            <button type="submit" className="button" name="intent" value="submit" disabled={isPending || hasConflict || Boolean(submissionError)}>
              Submit application
            </button>
          </div>
          {submissionError ? <p className="budget-app-submit-note">{submissionError}</p> : null}
        </div>
      ) : null}
      {feedback ? <p className={`budget-app-feedback budget-app-feedback-${feedback.kind}`} role="status">{feedback.message}</p> : null}
      {hasConflict ? (
        <div className="budget-app-conflict-action">
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              if (window.confirm('Load the latest saved draft? Your unsaved entries on this screen will be discarded.')) {
                window.location.reload();
              }
            }}
          >
            Load latest draft
          </button>
        </div>
      ) : null}
    </form>
  );
}
