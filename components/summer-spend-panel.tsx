import Link from 'next/link';
import type { SummerSpendSummary } from '@/lib/summer-spend';

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// Officer-facing roll-up of each team's summer spending against their planned
// (submitted year-end report) summer amount. Summer spend is its own bucket,
// separate from the leftover of the annual budget, so this panel reports
// planned / spent / remaining per team and in aggregate.
export function SummerSpendPanel({ summary }: { summary: SummerSpendSummary }) {
  const { teams, totalPlannedCents, totalSpentCents, totalRemainingCents, summerActive } = summary;

  return (
    <section className="hq-panel hq-surface-muted hq-summer-panel">
      <div className="hq-section-head">
        <div className="hq-section-head-copy">
          <p className="hq-eyebrow">{summerActive ? 'Summer spending · live' : 'Summer spending'}</p>
          <h2 className="hq-section-title hq-section-title-compact">Summer spend remaining by team</h2>
          <p className="hq-subtitle">
            Tracked against each team&apos;s planned summer spend from their year-end report — separate from
            the leftover of their annual budget.
          </p>
        </div>
        <div className="hq-summer-totals">
          <div className="hq-summer-total">
            <span>Planned</span>
            <strong>{usd(totalPlannedCents)}</strong>
          </div>
          <div className="hq-summer-total">
            <span>Spent</span>
            <strong>{usd(totalSpentCents)}</strong>
          </div>
          <div className="hq-summer-total">
            <span>Remaining</span>
            <strong className={totalRemainingCents < 0 ? 'hq-summer-over' : undefined}>
              {usd(totalRemainingCents)}
            </strong>
          </div>
        </div>
      </div>

      <div className="hq-team-list hq-team-list-compact">
        {teams.map((team) => {
          const usedPercent =
            team.plannedCents > 0
              ? Math.min(100, Math.round((team.spentCents / team.plannedCents) * 100))
              : team.spentCents > 0
                ? 100
                : 0;
          const over = team.remainingCents < 0;

          return (
            <div key={team.teamId} className="hq-team-row">
              <div className="hq-team-row-head">
                <Link
                  href={`/dashboard/finances?team=${team.teamId}`}
                  className="hq-team-heading hq-team-heading-link"
                >
                  <div className="hq-team-title-row">
                    {team.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logoUrl} alt="" className="hq-team-logo hq-team-logo-medium" />
                    ) : (
                      <div className="hq-team-logo hq-team-logo-medium hq-team-logo-fallback">
                        {team.teamName.slice(0, 1)}
                      </div>
                    )}
                    <h3>{team.teamName}</h3>
                  </div>
                </Link>
              </div>

              <div className="hq-budget-row-meta">
                <div className="hq-budget-meta-line">
                  <span>{team.hasSubmittedPlan ? 'Planned summer spend' : 'No summer plan submitted'}</span>
                  <strong>{usd(team.plannedCents)}</strong>
                </div>
                <div className="hq-budget-meta-line">
                  <span>Spent this summer</span>
                  <strong>{usd(team.spentCents)}</strong>
                </div>
                <div className="hq-budget-meta-line">
                  <span>{over ? 'Over by' : 'Remaining'}</span>
                  <strong className={over ? 'hq-summer-over' : undefined}>{usd(team.remainingCents)}</strong>
                </div>
                <div className="hq-budget-progress">
                  <div
                    className={`hq-budget-progress-fill${over ? ' hq-budget-progress-fill-over' : ''}`}
                    style={{ width: `${usedPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
