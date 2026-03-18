import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { formatAcademicYear } from '@/lib/academic-calendar';
import { updateClubBudgetAction, updateTeamBudgetAction } from '@/app/dashboard/actions';
import { InlineBudgetEditor } from '@/components/inline-budget-editor';

type Team = {
  id: string;
  name: string;
  logo_url: string | null;
};

type TeamBudget = {
  team_id: string;
  academic_year: string;
  annual_budget_cents: number;
};

type ClubBudget = {
  academic_year: string;
  total_budget_cents: number;
};

type PurchaseLog = {
  team_id: string;
  amount_cents: number;
  purchased_at: string;
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function FinancesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const supabase = await createClient();
  const admin = createAdminClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active || (me.role !== 'admin' && me.role !== 'president')) {
    redirect('/dashboard');
  }
  const canEdit = me.role === 'admin';

  const cycle = formatAcademicYear(new Date());
  const selectedTeamId = readSingle(params.team) || 'all';
  const selectedRange = readSingle(params.range) || 'current_cycle';
  const { data: teamsData } = await admin.from('teams').select('id, name, logo_url').order('name');
  const { data: teamBudgetsData } = await admin
    .from('team_budgets')
    .select('team_id, academic_year, annual_budget_cents')
    .eq('academic_year', cycle);
  const { data: clubBudgetData } = await admin
    .from('club_budgets')
    .select('academic_year, total_budget_cents')
    .eq('academic_year', cycle)
    .maybeSingle();
  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('team_id, amount_cents, purchased_at, academic_year');

  const teams = (teamsData || []) as Team[];
  const validSelectedTeamId = selectedTeamId === 'all' || teams.some((team) => team.id === selectedTeamId) ? selectedTeamId : 'all';
  const teamBudgets = new Map(
    ((teamBudgetsData || []) as TeamBudget[]).map((entry) => [entry.team_id, entry.annual_budget_cents])
  );
  const clubBudget = (clubBudgetData || { academic_year: cycle, total_budget_cents: 0 }) as ClubBudget;
  const purchases = (purchasesData || []) as PurchaseLog[];
  const allocatedTotal = teams.reduce((sum, team) => sum + (teamBudgets.get(team.id) || 0), 0);
  const remainingBudget = Math.max(0, clubBudget.total_budget_cents - allocatedTotal);
  const allocationPercent =
    clubBudget.total_budget_cents > 0 ? Math.min(100, Math.round((allocatedTotal / clubBudget.total_budget_cents) * 100)) : 0;
  const chartColors = ['#8c1515', '#3f6e8f', '#b27a2c', '#5d7c63', '#875e8c', '#bf5f4d', '#3f7c7c'];
  const spentByTeam = new Map<string, number>();
  for (const purchase of purchases) {
    spentByTeam.set(purchase.team_id, (spentByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
  }
  const filteredPurchases = purchases.filter((purchase) => {
    if (validSelectedTeamId !== 'all' && purchase.team_id !== validSelectedTeamId) {
      return false;
    }

    if (selectedRange === 'all_time') {
      return true;
    }

    if (selectedRange === 'last_90_days') {
      return new Date(purchase.purchased_at).getTime() >= Date.now() - 90 * 24 * 60 * 60 * 1000;
    }

    return formatAcademicYear(new Date(purchase.purchased_at)) === cycle;
  });
  const filteredSpendTotal = filteredPurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const filteredPurchaseCount = filteredPurchases.length;
  const filteredAverageSpend = filteredPurchaseCount > 0 ? Math.round(filteredSpendTotal / filteredPurchaseCount) : 0;
  const filteredSpentTeams = new Set(filteredPurchases.map((purchase) => purchase.team_id)).size;
  const filteredAllocatedBudget =
    validSelectedTeamId === 'all'
      ? allocatedTotal
      : teamBudgets.get(validSelectedTeamId) || 0;
  const filteredRemainingAllocated = Math.max(0, filteredAllocatedBudget - filteredSpendTotal);
  const filteredTotalBudget =
    validSelectedTeamId === 'all'
      ? clubBudget.total_budget_cents
      : teamBudgets.get(validSelectedTeamId) || 0;
  const filteredRemainingTotal = Math.max(0, filteredTotalBudget - filteredSpendTotal);
  const utilizationPercent =
    filteredAllocatedBudget > 0 ? Math.min(100, Math.round((filteredSpendTotal / filteredAllocatedBudget) * 100)) : 0;

  const chartEntries = teams
    .map((team, index) => ({
      id: team.id,
      name: team.name,
      amount: teamBudgets.get(team.id) || 0,
      color: chartColors[index % chartColors.length]
    }))
    .filter((team) => team.amount > 0);

  let cursor = 0;
  const slices = chartEntries
    .map((team) => {
      const amount = team.amount;
      if (clubBudget.total_budget_cents <= 0 || amount <= 0) {
        return null;
      }

      const start = cursor;
      const end = cursor + (amount / clubBudget.total_budget_cents) * 100;
      cursor = end;
      return `${team.color} ${start}% ${end}%`;
    })
    .filter(Boolean);

  if (clubBudget.total_budget_cents > 0 && remainingBudget > 0) {
    slices.push(`#e5e1e1 ${cursor}% 100%`);
  }

  const chartBackground = slices.length > 0 ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#e5e1e1 0 100%)';

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : 'President'}</p>
          <h1 className="hq-page-title">Manage finances</h1>
          <p className="hq-subtitle">
            {canEdit
              ? 'Set the total club budget and allocate annual budgets to each team for the current cycle.'
              : 'Review the total club budget and each team allocation for the current cycle.'}
          </p>
        </div>
      </section>

      <div className="hq-finance-layout">
        <aside className="hq-panel hq-lead-sidebar hq-surface-muted hq-finance-overview">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Club financial overview</p>
              <h2 className="hq-section-title hq-section-title-compact">{cycle}</h2>
            </div>
            <form className="hq-finance-filter-bar" method="get">
              <select className="select" name="team" defaultValue={validSelectedTeamId}>
                <option value="all">All teams</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <select className="select" name="range" defaultValue={selectedRange}>
                <option value="current_cycle">Current cycle</option>
                <option value="last_90_days">Last 90 days</option>
                <option value="all_time">All time</option>
              </select>
              <button className="button-secondary" type="submit">
                Apply
              </button>
            </form>
          </div>

          <div className="hq-finance-hero">
            <div className="hq-budget-ring-wrap hq-budget-ring-wrap-large">
              <div className="hq-budget-ring hq-budget-ring-large" style={{ background: chartBackground } as CSSProperties}>
                <div className="hq-budget-ring-inner hq-budget-ring-inner-large">
                  <strong>{allocationPercent}%</strong>
                  <span>allocated</span>
                </div>
              </div>
            </div>

            <div className="hq-finance-callouts">
              {chartEntries.map((team) => (
                <div key={team.id} className="hq-finance-callout">
                  <span className="hq-finance-callout-line" style={{ color: team.color }} aria-hidden="true" />
                  <div>
                    <span>{team.name}</span>
                    <strong>${(team.amount / 100).toLocaleString()}</strong>
                  </div>
                </div>
              ))}
              <div className="hq-finance-callout">
                <span className="hq-finance-callout-line" style={{ color: '#8f8888' }} aria-hidden="true" />
                <div>
                  <span>Unallocated</span>
                  <strong>${(remainingBudget / 100).toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>

          {canEdit ? (
            <InlineBudgetEditor
              action={updateClubBudgetAction}
              academicYear={cycle}
              fieldName="total_budget"
              label="Total club budget"
              value={clubBudget.total_budget_cents / 100}
              confirmMessage="Update the total club budget for this cycle?"
            />
          ) : null}

          <div className="hq-finance-metric-grid">
            <div className="hq-finance-metric-card">
              <span>Total club budget</span>
              <strong>${(clubBudget.total_budget_cents / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Allocated</span>
              <strong>${(allocatedTotal / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Unallocated</span>
              <strong>${(remainingBudget / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Filtered spend</span>
              <strong>${(filteredSpendTotal / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Avg purchase</span>
              <strong>${(filteredAverageSpend / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Utilization</span>
              <strong>{utilizationPercent}%</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Remaining from allocated</span>
              <strong>${(filteredRemainingAllocated / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Remaining from total</span>
              <strong>${(filteredRemainingTotal / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Teams with spend</span>
              <strong>{filteredSpentTeams}</strong>
            </div>
          </div>
        </aside>

        <section className="hq-panel hq-lead-main hq-surface-muted hq-finance-allocations">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team allocations</p>
              <h2 className="hq-section-title hq-section-title-compact">Annual budgets</h2>
            </div>
          </div>

          <div className="hq-team-list hq-team-list-compact">
            {teams.map((team) => (
              <div key={team.id} className="hq-team-row">
                <div className="hq-team-row-head">
                  <div className="hq-team-heading">
                    <div className="hq-team-title-row">
                      {team.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-medium" />
                      ) : (
                        <div className="hq-team-logo hq-team-logo-medium hq-team-logo-fallback">
                          {team.name.slice(0, 1)}
                        </div>
                      )}
                      <h3>{team.name}</h3>
                    </div>
                  </div>
                </div>

                <div className="hq-finance-team-row">
                  <div className="hq-finance-team-budget">
                    {canEdit ? (
                      <InlineBudgetEditor
                        action={updateTeamBudgetAction}
                        academicYear={cycle}
                        hiddenName="team_id"
                        hiddenValue={team.id}
                        fieldName="annual_budget"
                        label="Annual budget"
                        value={(teamBudgets.get(team.id) || 0) / 100}
                        confirmMessage={`Update the annual budget for ${team.name}?`}
                      />
                    ) : (
                      <div className="hq-summary-list">
                        <div className="hq-summary-row">
                          <span>Annual budget</span>
                          <strong>${((teamBudgets.get(team.id) || 0) / 100).toLocaleString()}</strong>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="hq-budget-row-meta">
                    <div className="hq-budget-meta-line">
                      <span>Spent</span>
                      <strong>${((spentByTeam.get(team.id) || 0) / 100).toLocaleString()}</strong>
                    </div>
                    <div className="hq-budget-progress">
                      <div
                        className="hq-budget-progress-fill"
                        style={{
                          width: `${
                            (teamBudgets.get(team.id) || 0) > 0
                              ? Math.min(100, Math.round(((spentByTeam.get(team.id) || 0) / (teamBudgets.get(team.id) || 1)) * 100))
                              : 0
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
