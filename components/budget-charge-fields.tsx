'use client';

import { useState } from 'react';
import { BUDGET_CATEGORY_LABELS } from '@/lib/team-budget-application-rules';
import type { ChargeAccount } from '@/lib/budget-charge-routing';

export function BudgetChargeFields({
  accounts,
  idPrefix,
  leadership = false,
  initialExpenseId = '',
  initialSourceId = ''
}: {
  accounts: ChargeAccount[];
  idPrefix: string;
  leadership?: boolean;
  initialExpenseId?: string;
  initialSourceId?: string;
}) {
  const [expenseId, setExpenseId] = useState(initialExpenseId);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const account = accounts.find((candidate) => candidate.expenseId === expenseId);

  return (
    <>
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-budget-account`}>
          {leadership ? 'Club budget line' : 'Budget category'}
        </label>
        <select
          className="select"
          id={`${idPrefix}-budget-account`}
          name="budget_expense_item_id"
          value={expenseId}
          onChange={(event) => {
            setExpenseId(event.target.value);
            setSourceId('');
          }}
          required
        >
          <option value="" disabled>Select a category…</option>
          {accounts.map((option) => (
            <option key={option.expenseId} value={option.expenseId} disabled={option.sources.length === 0}>
              {option.category ? BUDGET_CATEGORY_LABELS[option.category] : option.label}
            </option>
          ))}
        </select>
        {accounts.length === 0 ? <span className="helper">No budget accounts are configured yet.</span> : null}
      </div>
      {account?.sources.length === 1 ? (
        <><input type="hidden" name="funding_source_id" value={account.sources[0].id} />
        <span className="helper">Funding source: {account.sources[0].label}</span></>
      ) : account && account.sources.length > 1 ? (
        <div className="field">
          <label className="label" htmlFor={`${idPrefix}-funding-source`}>Funding source</label>
          <select
            className="select"
            id={`${idPrefix}-funding-source`}
            name="funding_source_id"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
            required
          >
            <option value="" disabled>Select a source…</option>
            {account.sources.map((source) => (
              <option key={source.id} value={source.id}>{source.label}</option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}
