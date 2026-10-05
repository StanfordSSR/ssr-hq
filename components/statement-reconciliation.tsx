'use client';

import { useState } from 'react';
import { rematchStatementAction, resolveStatementItemAction, uploadStatementAction } from '@/app/dashboard/actions';
import { BudgetChargeFields } from '@/components/budget-charge-fields';
import type { ChargeCatalog } from '@/lib/budget-charge-routing';
import { suggestStatementScope } from '@/lib/statement-import';

type StatementItem = {
  id: string;
  description: string;
  person_name: string | null;
  amount_cents: number;
  statement_date: string | null;
  raw_date: string;
  reference_number: string | null;
};

type TeamOption = { id: string; name: string };

type StatementReconciliationProps = {
  items: StatementItem[];
  teams: TeamOption[];
  catalog: ChargeCatalog | null;
  canEdit: boolean;
  summary: {
    total: number;
    accounted: number;
    unaccounted: number;
    disregarded: number;
    unaccountedTotalCents: number;
    accountedTotalCents: number;
    sheetTotalCents: number;
  };
  lastImport: { fileName: string | null; itemCount: number; createdAt: string } | null;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function suggestedTeamId(description: string, teams: TeamOption[]): string {
  const suggestion = suggestStatementScope(description);
  if (suggestion.scope !== 'team' || !suggestion.teamHint) {
    return '';
  }
  const hint = suggestion.teamHint;
  const match = teams.find((team) => team.name.toLowerCase().includes(hint));
  return match?.id || '';
}

function StatementAssignment({ itemId, defaultTeam, teams, catalog }: {
  itemId: string;
  defaultTeam: string;
  teams: TeamOption[];
  catalog: ChargeCatalog | null;
}) {
  const [scope, setScope] = useState<'team' | 'leadership'>('team');
  const [teamId, setTeamId] = useState(defaultTeam);
  const accounts = scope === 'leadership' ? catalog?.leadership || [] : catalog?.teams[teamId] || [];
  return <div className="form-stack">
    <form action={resolveStatementItemAction} className="hq-statement-actions">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="decision" value={scope} />
      <div className="field">
        <label className="label" htmlFor={`statement-scope-${itemId}`}>Assign to</label>
        <select id={`statement-scope-${itemId}`} className="select" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
          <option value="team">Team</option><option value="leadership">SSR Club / Leadership</option>
        </select>
      </div>
      {scope === 'team' ? <div className="field">
        <label className="label" htmlFor={`statement-team-${itemId}`}>Team</label>
        <select id={`statement-team-${itemId}`} className="select" name="team_id" value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
          <option value="">Choose team…</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div> : null}
      <BudgetChargeFields key={`${scope}:${teamId}`} accounts={accounts} idPrefix={`statement-${itemId}`} leadership={scope === 'leadership'} />
      <button className="button" type="submit">Assign purchase</button>
    </form>
    <form action={resolveStatementItemAction} className="hq-statement-actions">
      <input type="hidden" name="item_id" value={itemId} />
      <button className="button-secondary" type="submit" name="decision" value="unknown">Unknown</button>
      <button className="button-secondary" type="submit" name="decision" value="disregard">Disregard</button>
    </form>
  </div>;
}

export function StatementReconciliation({ items, teams, catalog, canEdit, summary, lastImport }: StatementReconciliationProps) {
  return (
    <div className="form-stack">
      <div className="hq-block-head">
        <h3>Finance statement reconciliation</h3>
        <span className="hq-inline-note">
          {formatCurrency(summary.accountedTotalCents)} of {formatCurrency(summary.sheetTotalCents)} reconciled
        </span>
      </div>

      <p className="helper">
        Import the official finance-office statement, then triage every purchase that is not yet accounted for in the
        portal. Auto-matching links a line item to a logged purchase when the amount is within a few percent and the
        descriptions share keywords.
      </p>

      <div className="hq-settings-grid">
        <div className="hq-setting-tile">
          <strong>Unaccounted</strong>
          <span>
            {summary.unaccounted} items · {formatCurrency(summary.unaccountedTotalCents)}
          </span>
        </div>
        <div className="hq-setting-tile">
          <strong>Reconciled from sheet</strong>
          <span>
            {summary.accounted} items · {formatCurrency(summary.accountedTotalCents)}
          </span>
        </div>
        <div className="hq-setting-tile">
          <strong>Disregarded</strong>
          <span>{summary.disregarded} items</span>
        </div>
        <div className="hq-setting-tile">
          <strong>Last import</strong>
          <span>
            {lastImport
              ? `${lastImport.fileName || 'statement'} · ${lastImport.itemCount} rows`
              : 'No statement imported yet'}
          </span>
        </div>
      </div>

      {canEdit ? (
        <div className="hq-inline-grid">
          <form action={uploadStatementAction} className="field">
            <label className="label" htmlFor="statement-csv">
              Upload statement CSV
            </label>
            <input className="input" id="statement-csv" name="statement_csv" type="file" accept=".csv,text/csv" required />
            <span className="helper">Re-uploading the same statement is safe; duplicate rows are skipped.</span>
            <div className="button-row">
              <button className="button" type="submit">
                Import statement
              </button>
            </div>
          </form>

          <form action={rematchStatementAction} className="field">
            <label className="label">Auto-match</label>
            <span className="helper">
              Re-run matching after teams log more purchases to clear additional items automatically.
            </span>
            <div className="button-row">
              <button className="button-secondary" type="submit">
                Re-run auto-match
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="hq-block-head">
        <h4>Unaccounted purchases</h4>
        <span className="hq-inline-note">Largest first</span>
      </div>

      {items.length === 0 ? (
        <p className="empty-note">Nothing to triage — every imported purchase is accounted for.</p>
      ) : (
        <div className="hq-task-stack">
          {items.map((item) => {
            const defaultTeam = suggestedTeamId(item.description, teams);
            const suggestion = suggestStatementScope(item.description);
            return (
              <article key={item.id} className="hq-task-card">
                <div className="hq-task-card-head">
                  <div>
                    <span className="hq-task-kicker">
                      {item.statement_date || item.raw_date}
                      {item.reference_number ? ` · ${item.reference_number}` : ''}
                      {item.person_name ? ` · ${item.person_name}` : ''}
                    </span>
                    <h4>{item.description}</h4>
                  </div>
                  <strong className="hq-statement-amount">{formatCurrency(item.amount_cents)}</strong>
                </div>

                {suggestion.scope !== 'unknown' ? (
                  <p className="helper">
                    Suggested: {suggestion.scope === 'leadership' ? 'Leadership / Operations' : `team — ${suggestion.teamHint}`}
                  </p>
                ) : null}

                {canEdit ? (
                  <StatementAssignment itemId={item.id} defaultTeam={defaultTeam} teams={teams} catalog={catalog} />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
