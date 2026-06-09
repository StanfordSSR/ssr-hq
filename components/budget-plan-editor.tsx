'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import {
  deleteExpenseItemAction,
  deleteFundingSourceAction,
  reviseBudgetPlanAction,
  signBudgetPlanAction,
  signQuarterDeclarationAction,
  submitBudgetPlanForApprovalAction,
  submitQuarterDeclarationForApprovalAction,
  upsertAllocationAction,
  upsertExpenseItemAction,
  upsertFundingSourceAction,
  upsertQuarterlyValueAction
} from '@/app/dashboard/actions';

type Source = {
  id: string;
  label: string;
  kind: string;
  amountCents: number;
  isDefaultPool: boolean;
  committedCents: number;
  remainingCents: number;
};
type Expense = {
  id: string;
  kind: string;
  teamId: string | null;
  category: string | null;
  label: string;
  amountCents: number;
  lockCadence: string;
  effectiveCents: number;
  allocatedCents: number;
  remainderFromGrantCents: number;
  spentCents: number;
};
type Allocation = { id: string; sourceId: string; expenseId: string; amountCents: number };
type Team = { id: string; name: string };
type Approval = { presidentId: string; hasSignature: boolean; source: string };
type President = { id: string; fullName: string };

type Props = {
  planId: string;
  academicYear: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  version: number;
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  sources: Source[];
  expenses: Expense[];
  allocations: Allocation[];
  teams: Team[];
  approvals: Approval[];
  presidents: President[];
  totalFundingCents: number;
  totalExpenseCents: number;
  uncoveredCents: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  other: 'Other'
};
const SOURCE_KIND_LABELS: Record<string, string> = {
  annual_grant: 'Annual grant',
  grant_reserves: 'Grant reserves',
  sponsorship: 'Sponsorship',
  other: 'Other'
};

function usd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export function BudgetPlanEditor(props: Props) {
  const {
    planId,
    academicYear,
    status,
    version,
    canEdit,
    currentUserIsPresident,
    sources,
    expenses,
    allocations,
    teams,
    approvals,
    presidents,
    totalFundingCents,
    totalExpenseCents,
    uncoveredCents
  } = props;

  const editable = canEdit && (status === 'draft' || status === 'pending_approval');
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name || 'Team';
  const sourceLabel = (id: string) => sources.find((s) => s.id === id)?.label || 'Source';

  const teamExpenses = expenses.filter((e) => e.kind === 'team');
  const otherExpenses = expenses.filter((e) => e.kind !== 'team');
  const teamIds = Array.from(new Set(teamExpenses.map((e) => e.teamId).filter(Boolean))) as string[];

  const fundingPct = totalFundingCents > 0 ? Math.min(100, Math.round((totalExpenseCents / totalFundingCents) * 100)) : 0;

  return (
    <div className="form-stack hq-budget-plan">
      <div className="eoy-autofill-grid">
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Total funding</span>
          <strong className="eoy-autofill-value">{usd(totalFundingCents)}</strong>
        </div>
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Planned expenses</span>
          <strong className="eoy-autofill-value">{usd(totalExpenseCents)}</strong>
          <span className="helper">{fundingPct}% of funding committed</span>
        </div>
        <div className="eoy-autofill-card">
          <span className="eoy-autofill-label">Unfunded</span>
          <strong className="eoy-autofill-value" style={{ color: uncoveredCents > 0 ? '#8c1515' : undefined }}>
            {usd(uncoveredCents)}
          </strong>
          {uncoveredCents > 0 ? <span className="eoy-autofill-warning">Funding falls short of expenses.</span> : null}
        </div>
      </div>

      {/* ── Funding sources ── */}
      <section className="hq-question-card">
        <div className="hq-block-head">
          <h3>Funding sources</h3>
          <span className="hq-inline-note">where the money comes from</span>
        </div>

        <div className="hq-budget-line-list">
          {sources.map((source) => (
            <div key={source.id} className="hq-budget-line">
              <div className="hq-budget-line-main">
                <strong>
                  {source.label}
                  {source.isDefaultPool ? <span className="hq-budget-tag">default pool</span> : null}
                </strong>
                <span className="helper">
                  {SOURCE_KIND_LABELS[source.kind] || source.kind} · {usd(source.committedCents)} committed ·{' '}
                  {usd(source.remainingCents)} free
                </span>
              </div>
              <strong className="hq-budget-line-amount">{usd(source.amountCents)}</strong>
              {editable ? (
                <details className="hq-budget-edit">
                  <summary>Edit</summary>
                  <form action={upsertFundingSourceAction} className="hq-budget-form">
                    <input type="hidden" name="plan_id" value={planId} />
                    <input type="hidden" name="source_id" value={source.id} />
                    <input className="input" name="label" defaultValue={source.label} required />
                    <select className="select" name="kind" defaultValue={source.kind}>
                      {Object.entries(SOURCE_KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={dollars(source.amountCents)} />
                    <label className="hq-budget-check">
                      <input type="checkbox" name="is_default_pool" defaultChecked={source.isDefaultPool} /> Default pool
                    </label>
                    <div className="button-row">
                      <button className="button" type="submit">
                        Save
                      </button>
                    </div>
                  </form>
                  {!source.isDefaultPool ? (
                    <form action={deleteFundingSourceAction}>
                      <input type="hidden" name="plan_id" value={planId} />
                      <input type="hidden" name="source_id" value={source.id} />
                      <button className="hq-inline-link" type="submit">
                        Remove source
                      </button>
                    </form>
                  ) : null}
                </details>
              ) : null}
            </div>
          ))}
        </div>

        {editable ? (
          <details className="hq-budget-add">
            <summary>+ Add funding source</summary>
            <form action={upsertFundingSourceAction} className="hq-budget-form">
              <input type="hidden" name="plan_id" value={planId} />
              <input className="input" name="label" placeholder="Sponsor name / grant" required />
              <select className="select" name="kind" defaultValue="sponsorship">
                {Object.entries(SOURCE_KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input className="input" name="amount" type="number" min="0" step="0.01" placeholder="Amount" />
              <div className="button-row">
                <button className="button" type="submit">
                  Add source
                </button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      {/* ── Team budgets (category sub-budgets) ── */}
      <section className="hq-question-card">
        <div className="hq-block-head">
          <h3>Team budgets</h3>
          <span className="hq-inline-note">per-category caps with lock cadence</span>
        </div>

        {teamIds.map((teamId) => {
          const rows = teamExpenses.filter((e) => e.teamId === teamId);
          const teamTotal = rows.reduce((sum, r) => sum + r.effectiveCents, 0);
          const teamSpent = rows.reduce((sum, r) => sum + r.spentCents, 0);
          return (
            <div key={teamId} className="hq-budget-team">
              <div className="hq-budget-team-head">
                <strong>{teamName(teamId)}</strong>
                <span className="helper">
                  {usd(teamTotal)} budget · {usd(teamSpent)} spent
                </span>
              </div>
              {rows.map((row) => (
                <div key={row.id} className="hq-budget-cat">
                  <div className="hq-budget-cat-head">
                    <span>{CATEGORY_LABELS[row.category || 'other']}</span>
                    <span className={`hq-budget-tag hq-budget-tag-${row.lockCadence}`}>{row.lockCadence}</span>
                    <strong>{usd(row.effectiveCents)}</strong>
                  </div>
                  <div className="hq-budget-progress">
                    <div
                      className="hq-budget-progress-fill"
                      style={{ width: `${row.effectiveCents > 0 ? Math.min(100, Math.round((row.spentCents / row.effectiveCents) * 100)) : 0}%` }}
                    />
                  </div>
                  <span className="helper">{usd(row.spentCents)} spent · {usd(Math.max(0, row.effectiveCents - row.spentCents))} left</span>
                  {editable ? (
                    <details className="hq-budget-edit">
                      <summary>Edit</summary>
                      <form action={upsertExpenseItemAction} className="hq-budget-form">
                        <input type="hidden" name="plan_id" value={planId} />
                        <input type="hidden" name="expense_id" value={row.id} />
                        <input type="hidden" name="kind" value="team" />
                        <input type="hidden" name="team_id" value={teamId} />
                        <input type="hidden" name="category" value={row.category || 'other'} />
                        <input type="hidden" name="label" value={row.label} />
                        <input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={dollars(row.amountCents)} />
                        <select className="select" name="lock_cadence" defaultValue={row.lockCadence}>
                          <option value="yearly">Locked yearly</option>
                          <option value="quarterly">Locked quarterly</option>
                          <option value="unlocked">Unlocked</option>
                        </select>
                        <div className="button-row">
                          <button className="button" type="submit">
                            Save
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          );
        })}
      </section>

      {/* ── Events / operations ── */}
      <section className="hq-question-card">
        <div className="hq-block-head">
          <h3>Events &amp; operations</h3>
        </div>
        <div className="hq-budget-line-list">
          {otherExpenses.map((row) => (
            <div key={row.id} className="hq-budget-line">
              <div className="hq-budget-line-main">
                <strong>
                  {row.label} <span className={`hq-budget-tag hq-budget-tag-${row.lockCadence}`}>{row.lockCadence}</span>
                </strong>
                <span className="helper">
                  {row.kind} · {usd(row.remainderFromGrantCents)} from annual grant
                </span>
              </div>
              <strong className="hq-budget-line-amount">{usd(row.effectiveCents)}</strong>
              {canEdit ? (
                <details className="hq-budget-edit">
                  <summary>Edit</summary>
                  <form action={upsertExpenseItemAction} className="hq-budget-form">
                    <input type="hidden" name="plan_id" value={planId} />
                    <input type="hidden" name="expense_id" value={row.id} />
                    <input type="hidden" name="kind" value={row.kind} />
                    <input className="input" name="label" defaultValue={row.label} required />
                    <input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={dollars(row.amountCents)} />
                    <select className="select" name="lock_cadence" defaultValue={row.lockCadence}>
                      <option value="yearly">Locked yearly</option>
                      <option value="quarterly">Locked quarterly</option>
                      <option value="unlocked">Unlocked</option>
                    </select>
                    <div className="button-row">
                      <button className="button" type="submit">
                        Save
                      </button>
                    </div>
                  </form>
                  {editable ? (
                    <form action={deleteExpenseItemAction}>
                      <input type="hidden" name="plan_id" value={planId} />
                      <input type="hidden" name="expense_id" value={row.id} />
                      <button className="hq-inline-link" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : null}
                </details>
              ) : null}
            </div>
          ))}
          {otherExpenses.length === 0 ? <p className="empty-note">No events or operations line items yet.</p> : null}
        </div>

        {editable ? (
          <details className="hq-budget-add">
            <summary>+ Add event / operations line item</summary>
            <form action={upsertExpenseItemAction} className="hq-budget-form">
              <input type="hidden" name="plan_id" value={planId} />
              <input className="input" name="label" placeholder="e.g. Spring showcase" required />
              <select className="select" name="kind" defaultValue="event">
                <option value="event">Event</option>
                <option value="operations">Operations</option>
                <option value="general">General</option>
              </select>
              <input className="input" name="amount" type="number" min="0" step="0.01" placeholder="Amount" />
              <select className="select" name="lock_cadence" defaultValue="unlocked">
                <option value="unlocked">Unlocked</option>
                <option value="yearly">Locked yearly</option>
                <option value="quarterly">Locked quarterly</option>
              </select>
              <div className="button-row">
                <button className="button" type="submit">
                  Add line item
                </button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      {/* ── Allocations ── */}
      <section className="hq-question-card">
        <div className="hq-block-head">
          <h3>Source allocations</h3>
          <span className="hq-inline-note">remainder draws from the annual grant</span>
        </div>
        <div className="hq-summary-list">
          {allocations.map((alloc) => (
            <div key={alloc.id} className="hq-summary-row">
              <span>{sourceLabel(alloc.sourceId)}</span>
              <strong>→ {expenses.find((e) => e.id === alloc.expenseId)?.label || 'line item'}</strong>
              <strong>{usd(alloc.amountCents)}</strong>
              {editable ? (
                <form action={upsertAllocationAction}>
                  <input type="hidden" name="plan_id" value={planId} />
                  <input type="hidden" name="source_id" value={alloc.sourceId} />
                  <input type="hidden" name="expense_id" value={alloc.expenseId} />
                  <input type="hidden" name="amount" value="0" />
                  <button className="hq-inline-link" type="submit">
                    Remove
                  </button>
                </form>
              ) : null}
            </div>
          ))}
          {allocations.length === 0 ? (
            <p className="empty-note">No explicit allocations — every line item draws fully from the annual grant.</p>
          ) : null}
        </div>

        {editable ? (
          <details className="hq-budget-add">
            <summary>+ Allocate a source to a line item</summary>
            <form action={upsertAllocationAction} className="hq-budget-form">
              <input type="hidden" name="plan_id" value={planId} />
              <select className="select" name="source_id" required defaultValue="">
                <option value="" disabled>
                  Funding source…
                </option>
                {sources.filter((s) => !s.isDefaultPool).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({usd(s.remainingCents)} free)
                  </option>
                ))}
              </select>
              <select className="select" name="expense_id" required defaultValue="">
                <option value="" disabled>
                  Line item…
                </option>
                {expenses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.kind === 'team' ? `${teamName(e.teamId)} — ${CATEGORY_LABELS[e.category || 'other']}` : e.label}
                  </option>
                ))}
              </select>
              <input className="input" name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
              <div className="button-row">
                <button className="button" type="submit">
                  Allocate
                </button>
              </div>
            </form>
          </details>
        ) : null}
      </section>

      {/* ── Approval ── */}
      <BudgetApprovalPanel
        targetType="plan"
        targetId={planId}
        academicYear={academicYear}
        status={status}
        version={version}
        canEdit={canEdit}
        currentUserIsPresident={currentUserIsPresident}
        currentUserId={props.currentUserId}
        approvals={approvals}
        presidents={presidents}
        uncoveredCents={uncoveredCents}
      />
    </div>
  );
}

export function BudgetApprovalPanel({
  targetType,
  targetId,
  status,
  version,
  canEdit,
  currentUserIsPresident,
  currentUserId,
  approvals,
  presidents,
  uncoveredCents,
  academicYear
}: {
  targetType: 'plan' | 'quarter';
  targetId: string;
  academicYear: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  version: number;
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  approvals: Approval[];
  presidents: President[];
  uncoveredCents: number;
}) {
  const [signature, setSignature] = useState('');
  const mySigned = approvals.some((a) => a.presidentId === currentUserId && a.hasSignature);

  return (
    <section className="hq-question-card eoy-ack-card">
      <div className="hq-block-head">
        <h3>President approval</h3>
        <span className={`hq-status-chip hq-status-${status === 'approved' ? 'open' : 'pending'}`}>
          {status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Awaiting signatures' : 'Draft'}
          {version > 1 ? ` · v${version}` : ''}
        </span>
      </div>

      <div className="hq-summary-list">
        {presidents.map((president) => {
          const signed = approvals.some((a) => a.presidentId === president.id && a.hasSignature);
          const intent = approvals.some((a) => a.presidentId === president.id);
          return (
            <div key={president.id} className="hq-summary-row">
              <span>{president.fullName}</span>
              <strong>{signed ? 'Signed in portal' : intent ? 'Approved in Slack (signature pending)' : 'Not signed'}</strong>
            </div>
          );
        })}
        {presidents.length !== 2 ? (
          <p className="eoy-over-limit helper">Approval needs exactly two active presidents (currently {presidents.length}).</p>
        ) : null}
      </div>

      {canEdit && status === 'draft' ? (
        <form action={submitBudgetPlanForApprovalAction} className="button-row">
          <input type="hidden" name="plan_id" value={targetId} />
          <button className="button" type="submit" disabled={uncoveredCents > 0 || presidents.length !== 2}>
            Send to presidents for approval
          </button>
          {uncoveredCents > 0 ? <span className="helper eoy-submit-hint">Resolve unfunded expenses first.</span> : null}
        </form>
      ) : null}

      {canEdit && status === 'approved' && targetType === 'plan' ? (
        <form action={reviseBudgetPlanAction} className="button-row">
          <input type="hidden" name="plan_id" value={targetId} />
          <button className="button-secondary" type="submit">
            Start a revision
          </button>
        </form>
      ) : null}

      {currentUserIsPresident && status === 'pending_approval' ? (
        <div className="form-stack">
          <p className="hq-question-prompt">
            By signing below you approve the {academicYear} budget on behalf of the presidency.
          </p>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            actionLabel="Sign to approve"
            title="Sign the budget approval"
            altText="President signature"
          />
          {mySigned ? <p className="helper">You have already signed.</p> : null}
          <form action={signBudgetPlanAction} className="button-row">
            <input type="hidden" name="plan_id" value={targetId} />
            <input type="hidden" name="signature" value={signature} />
            <button className="button" type="submit" disabled={!signature}>
              Submit signature
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

export function QuarterlyDeclarationPanel({
  declarationId,
  quarter,
  status,
  canEdit,
  currentUserIsPresident,
  currentUserId,
  items,
  approvals,
  presidents
}: {
  declarationId: string;
  quarter: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'superseded';
  canEdit: boolean;
  currentUserIsPresident: boolean;
  currentUserId: string;
  items: Array<{ expenseItemId: string; label: string; amountCents: number }>;
  approvals: Approval[];
  presidents: President[];
}) {
  const [signature, setSignature] = useState('');
  const editable = canEdit && (status === 'draft' || status === 'pending_approval');

  return (
    <section className="hq-question-card">
      <div className="hq-block-head">
        <h3>{quarter} declaration</h3>
        <span className={`hq-status-chip hq-status-${status === 'approved' ? 'open' : 'pending'}`}>
          {status === 'approved' ? 'Approved' : status === 'pending_approval' ? 'Awaiting signatures' : 'Draft'}
        </span>
      </div>

      <div className="hq-budget-line-list">
        {items.map((item) => (
          <div key={item.expenseItemId} className="hq-budget-line">
            <div className="hq-budget-line-main">
              <strong>{item.label}</strong>
            </div>
            {editable ? (
              <form action={upsertQuarterlyValueAction} className="hq-budget-inline-form">
                <input type="hidden" name="declaration_id" value={declarationId} />
                <input type="hidden" name="expense_item_id" value={item.expenseItemId} />
                <input className="input" name="amount" type="number" min="0" step="0.01" defaultValue={(item.amountCents / 100).toFixed(2)} />
                <button className="button-secondary" type="submit">
                  Save
                </button>
              </form>
            ) : (
              <strong className="hq-budget-line-amount">{usd(item.amountCents)}</strong>
            )}
          </div>
        ))}
        {items.length === 0 ? <p className="empty-note">No quarterly-locked sub-budgets in this plan.</p> : null}
      </div>

      <div className="hq-summary-list">
        {presidents.map((president) => {
          const signed = approvals.some((a) => a.presidentId === president.id && a.hasSignature);
          return (
            <div key={president.id} className="hq-summary-row">
              <span>{president.fullName}</span>
              <strong>{signed ? 'Signed' : 'Not signed'}</strong>
            </div>
          );
        })}
      </div>

      {canEdit && status === 'draft' ? (
        <form action={submitQuarterDeclarationForApprovalAction} className="button-row">
          <input type="hidden" name="declaration_id" value={declarationId} />
          <button className="button" type="submit" disabled={presidents.length !== 2}>
            Send to presidents for approval
          </button>
        </form>
      ) : null}

      {currentUserIsPresident && status === 'pending_approval' ? (
        <div className="form-stack">
          <SignaturePad
            value={signature}
            onChange={setSignature}
            actionLabel="Sign to approve"
            title={`Sign the ${quarter} budget`}
            altText="President signature"
          />
          <form action={signQuarterDeclarationAction} className="button-row">
            <input type="hidden" name="declaration_id" value={declarationId} />
            <input type="hidden" name="signature" value={signature} />
            <button className="button" type="submit" disabled={!signature}>
              Submit signature
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
