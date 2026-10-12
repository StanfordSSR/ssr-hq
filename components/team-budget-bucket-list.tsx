import type { buildTeamBuckets } from '@/lib/finance-team-buckets';

type BucketSummary = ReturnType<typeof buildTeamBuckets>;

const categoryLabels: Record<string, string> = {
  equipment: 'Equipment', food: 'Food', travel: 'Travel', registration: 'Registration', other: 'Other'
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function TeamBudgetBucketList({ summary }: { summary: BucketSummary }) {
  const allocatedCents = summary.buckets.reduce((sum, bucket) => sum + bucket.capCents, 0);
  return (
    <section className="hq-finance-buckets hq-finance-team-buckets" aria-label="Budget categories">
      <div className="hq-finance-buckets-head">
        <h3>Budget categories</h3>
        <strong>{money(allocatedCents)} allocated</strong>
      </div>
      {summary.buckets.length === 0 ? <p className="empty-note">No approved budget categories for this team.</p> : (
        <div className="hq-finance-team-bucket-list">
          {summary.buckets.map((bucket) => (
            <div className="hq-finance-team-bucket" key={bucket.expenseId}>
              <div className="hq-finance-bucket-line">
                <strong>{bucket.category ? categoryLabels[bucket.category] : bucket.label}</strong>
                <span>{money(bucket.spentCents)} spent / {money(bucket.capCents)}</span>
              </div>
              <div className="hq-budget-progress" role="progressbar" aria-label={`${bucket.label} spent`}
                aria-valuemin={0} aria-valuemax={Math.max(bucket.capCents, 1)}
                aria-valuenow={Math.min(bucket.capCents, bucket.spentCents)}>
                <div className={`hq-budget-progress-fill${bucket.spentCents > bucket.capCents ? ' hq-budget-progress-fill-over' : ''}`}
                  style={{ width: `${bucket.capCents > 0 ? Math.min(100, bucket.spentCents / bucket.capCents * 100) : 0}%` }} />
              </div>
              {bucket.pendingCents > 0 ? (
                <p className="hq-finance-pending-note">{money(bucket.pendingCents)} pending approval, not counted as spent</p>
              ) : null}
              {bucket.sourceTotals.length > 0 ? (
                <div className="hq-finance-source-list">
                  {bucket.sourceTotals.map((source) => (
                    <div className="hq-finance-source" key={source.id}>
                      <span>{source.label}</span>
                      {bucket.sourceTotals.length > 1 ? (
                        <span>{money(source.spentCents)} / {money(source.capCents)}
                          {source.pendingCents > 0 ? ` · ${money(source.pendingCents)} pending` : ''}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {summary.unassignedSpentCents > 0 ? (
        <p className="hq-finance-unassigned">{money(summary.unassignedSpentCents)} in approved spending has no current-plan category.</p>
      ) : null}
      {summary.unassignedPendingCents > 0 ? (
        <p className="hq-finance-pending-note">{money(summary.unassignedPendingCents)} pending without a current-plan category.</p>
      ) : null}
    </section>
  );
}
