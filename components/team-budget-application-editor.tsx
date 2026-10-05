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
      if (caps[category] > 0 && !rows.some((row) => row.category === category)) {
        rows.push({ id: `empty-${category}`, category, description: '', amount: '' });
      }
    }
  }
  return rows;
}

function parseRows(rows: EditorRow[]): { items: BudgetApplicationItem[]; error: string | null } {
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
    if (amountCents < 1 || amountCents > 100_000_000) {
      return { items, error: 'Each line amount must be between $0.01 and $1,000,000.' };
    }
    items.push({ id: row.id, category: row.category, description, amountCents });
  }
  return { items, error: null };
}

export function TeamBudgetApplicationEditor({
  teamId,
  academicYear,
  caps,
  initialItems,
  initialVersion,
  initialStatus,
  canEdit,
  isPreview = false
}: {
  teamId: string;
  academicYear: string;
  caps: BudgetCaps;
  initialItems: BudgetApplicationItem[];
  initialVersion: number;
  initialStatus: 'draft' | 'submitted';
  canEdit: boolean;
  isPreview?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() => initialRows(initialItems, (canEdit || isPreview) && initialStatus === 'draft', caps));
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState(initialStatus);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const editable = (canEdit || isPreview) && status === 'draft';
  const parsed = useMemo(() => parseRows(rows), [rows]);
  const submissionError = parsed.error || getSubmissionError(parsed.items, caps);
  const totalCents = parsed.items.reduce((sum, item) => sum + item.amountCents, 0);

  function changeRow(id: string, field: 'description' | 'amount', value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setFeedback(null);
  }

  function addRows(category: BudgetCategory, count: number) {
    setRows((current) => [
      ...current,
      ...Array.from({ length: Math.min(count, 200 - current.length) }, () => ({
        id: crypto.randomUUID(), category, description: '', amount: ''
      }))
    ]);
    setFeedback(null);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setFeedback(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPreview) return;
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
          setFeedback({ kind: 'error', message: result.error });
          return;
        }
        setVersion(result.version);
        setStatus(result.status);
        setFeedback({ kind: 'success', message: result.status === 'submitted' ? 'Application submitted.' : 'Draft saved.' });
        router.refresh();
      } catch {
        setFeedback({ kind: 'error', message: 'Could not reach the server. Your entries are still here; try again.' });
      }
    });
  }

  return (
    <form className="budget-app-form" onSubmit={handleSubmit}>
      {isPreview ? <p className="budget-app-notice budget-app-notice-warning" role="status">President preview. Changes here are local and cannot be saved before opening.</p> : null}
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
        </div>
      </div>

      {BUDGET_CATEGORIES.map((category) => {
        const categoryRows = rows.filter((row) => row.category === category);
        const request = getCategoryRequest(parsed.items, category, caps[category]);
        const blankRowsNeeded = Math.max(0, request.requiredItemCount - categoryRows.length);
        return (
          <section className="budget-app-category" key={category} aria-labelledby={`budget-app-${category}`}>
            <div className="budget-app-category-head">
              <div>
                <h2 id={`budget-app-${category}`}>{BUDGET_CATEGORY_LABELS[category]}</h2>
                <p>Cap {formatBudgetMoney(caps[category])} · 15% ceiling {formatBudgetMoney(request.maxCents)}</p>
              </div>
              <strong className={request.overLimit ? 'th-bad' : request.overCap ? 'th-warn' : undefined}>
                {formatBudgetMoney(request.totalCents)} requested
              </strong>
            </div>

            {request.overLimit ? (
              <p className="budget-app-notice budget-app-notice-error" role="alert">
                Over the 15% ceiling by {formatBudgetMoney(request.totalCents - request.maxCents)}. Submission is blocked.
              </p>
            ) : request.overCap ? (
              <p className="budget-app-notice budget-app-notice-warning" role="status">
                {formatBudgetMoney(request.totalCents - caps[category])} over the category cap. You can submit up to the 15% ceiling.
              </p>
            ) : null}
            {request.missingItems > 0 ? (
              <p className="budget-app-notice budget-app-notice-warning" role="status">
                Add {request.missingItems} more line item{request.missingItems === 1 ? '' : 's'}; average no more than $1,000 per line.
              </p>
            ) : null}

            {categoryRows.length > 0 ? (
              <div className="budget-app-lines">
                {categoryRows.map((row, index) => (
                  <div className="budget-app-line" key={row.id}>
                    <label>
                      <span>Line {index + 1}</span>
                      {editable ? (
                        <input
                          type="text"
                          value={row.description}
                          maxLength={160}
                          onChange={(event) => changeRow(row.id, 'description', event.target.value)}
                          placeholder="Item or grouped purpose"
                          disabled={isPending}
                        />
                      ) : <span className="budget-app-readonly">{row.description}</span>}
                    </label>
                    <label>
                      <span>Amount</span>
                      {editable ? (
                        <span className="budget-app-money-input">
                          <span>$</span>
                          <input
                            type="number"
                            min="0.01"
                            max="1000000"
                            step="0.01"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(event) => changeRow(row.id, 'amount', event.target.value)}
                            disabled={isPending}
                          />
                        </span>
                      ) : <span className="budget-app-readonly">{row.amount ? formatBudgetMoney(Math.round(Number(row.amount) * 100)) : ''}</span>}
                    </label>
                    {editable ? (
                      <button type="button" className="budget-app-remove" onClick={() => removeRow(row.id)} disabled={isPending} aria-label={`Remove ${BUDGET_CATEGORY_LABELS[category]} line ${index + 1}`}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : <p className="empty-note">No {category} items.</p>}

            {editable && caps[category] > 0 ? (
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
            <button type="submit" className="button-secondary" name="intent" value="draft" disabled={isPreview || isPending || Boolean(parsed.error)}>
              {isPending ? 'Saving...' : 'Save draft'}
            </button>
            <button type="submit" className="button" name="intent" value="submit" disabled={isPreview || isPending || Boolean(submissionError)}>
              Submit application
            </button>
          </div>
          {submissionError ? <p className="budget-app-submit-note">{submissionError}</p> : null}
        </div>
      ) : null}
      {feedback ? <p className={`budget-app-feedback budget-app-feedback-${feedback.kind}`} role="status">{feedback.message}</p> : null}
    </form>
  );
}
