import { rematchStatementAction, resolveStatementItemAction, uploadStatementAction } from '@/app/dashboard/actions';
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
  canEdit: boolean;
  summary: {
    total: number;
    accounted: number;
    unaccounted: number;
    disregarded: number;
    unaccountedTotalCents: number;
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

export function StatementReconciliation({ items, teams, canEdit, summary, lastImport }: StatementReconciliationProps) {
  return (
    <div className="form-stack">
      <div className="hq-block-head">
        <h3>Finance statement reconciliation</h3>
        <span className="hq-inline-note">{summary.unaccounted} unaccounted</span>
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
          <strong>Accounted for</strong>
          <span>{summary.accounted} matched or assigned</span>
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
                  <form action={resolveStatementItemAction} className="hq-statement-actions">
                    <input type="hidden" name="item_id" value={item.id} />
                    <select className="select" name="team_id" defaultValue={defaultTeam} aria-label="Team">
                      <option value="">Choose team…</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <button className="button" type="submit" name="decision" value="team">
                      Assign to team
                    </button>
                    <button className="button-secondary" type="submit" name="decision" value="leadership">
                      Leadership / Ops
                    </button>
                    <button className="button-secondary" type="submit" name="decision" value="unknown">
                      Unknown
                    </button>
                    <button className="button-secondary" type="submit" name="decision" value="disregard">
                      Disregard
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
