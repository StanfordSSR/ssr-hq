import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getCurrentAcademicYear } from '@/lib/academic-calendar';
import { ManualPurchaseForm } from '@/components/manual-purchase-form';
import { updateClubBudgetAction, updateTeamBudgetAction } from '@/app/dashboard/actions';
import { InlineBudgetEditor } from '@/components/inline-budget-editor';
import { getViewerContext } from '@/lib/auth';

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
  id?: string;
  team_id: string;
  amount_cents: number;
  purchased_at: string;
  category: 'equipment' | 'food' | 'travel';
  description?: string;
  person_name?: string | null;
  payment_method?: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
};

const paymentMethodLabel: Record<'reimbursement' | 'credit_card' | 'amazon' | 'unknown', string> = {
  credit_card: 'Credit card',
  amazon: 'Amazon',
  reimbursement: 'Reimbursement',
  unknown: 'Unknown'
};

const categoryLabel: Record<'equipment' | 'food' | 'travel', string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel'
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
  const admin = createAdminClient();
  const { currentRole, profile } = await getViewerContext();
  if (currentRole !== 'admin' && currentRole !== 'president' && currentRole !== 'financial_officer') {
    redirect('/dashboard');
  }
  const canEdit = currentRole === 'admin';
  const canLogPurchases = currentRole === 'admin' || currentRole === 'financial_officer';

  const cycle = await getCurrentAcademicYear();
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
  const purchaseScopeQuery = admin
    .from('purchase_logs')
    .select('team_id, amount_cents, purchased_at, category, academic_year');
  const filteredPurchaseQuery = admin
    .from('purchase_logs')
    .select('team_id, amount_cents, purchased_at, category, academic_year');

  const teams = (teamsData || []) as Team[];
  const validSelectedTeamId = selectedTeamId === 'all' || teams.some((team) => team.id === selectedTeamId) ? selectedTeamId : 'all';
  if (validSelectedTeamId !== 'all') {
    purchaseScopeQuery.eq('team_id', validSelectedTeamId);
    filteredPurchaseQuery.eq('team_id', validSelectedTeamId);
  }

  if (selectedRange === 'current_cycle') {
    filteredPurchaseQuery.eq('academic_year', cycle);
  } else if (selectedRange === 'last_90_days') {
    filteredPurchaseQuery.gte('purchased_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
  }

  const [{ data: purchasesData }, { data: filteredPurchasesData }, { data: cyclePurchasesData }] = await Promise.all([
    purchaseScopeQuery,
    filteredPurchaseQuery,
    admin.from('purchase_logs').select('team_id, amount_cents').eq('academic_year', cycle)
  ]);
  const teamBudgets = new Map(
    ((teamBudgetsData || []) as TeamBudget[]).map((entry) => [entry.team_id, entry.annual_budget_cents])
  );
  const clubBudget = (clubBudgetData || { academic_year: cycle, total_budget_cents: 0 }) as ClubBudget;
  const purchases = (purchasesData || []) as PurchaseLog[];
  const filteredPurchases = (filteredPurchasesData || []) as PurchaseLog[];
  const { data: rosterMembersData } = validSelectedTeamId !== 'all'
    ? await admin.from('team_roster_members').select('id').eq('team_id', validSelectedTeamId)
    : { data: [] };
  const { data: selectedTeamPurchasesData } = validSelectedTeamId !== 'all'
    ? await admin
        .from('purchase_logs')
        .select('id, team_id, description, amount_cents, purchased_at, person_name, payment_method, category')
        .eq('team_id', validSelectedTeamId)
        .order('purchased_at', { ascending: false })
        .limit(25)
    : { data: [] };
  const { data: teamMembershipsData } = validSelectedTeamId !== 'all'
    ? await admin
        .from('team_memberships')
        .select('id')
        .eq('team_id', validSelectedTeamId)
        .eq('is_active', true)
    : { data: [] };
  const allocatedTotal = teams.reduce((sum, team) => sum + (teamBudgets.get(team.id) || 0), 0);
  const remainingBudget = Math.max(0, clubBudget.total_budget_cents - allocatedTotal);
  const allocationPercent =
    clubBudget.total_budget_cents > 0 ? Math.min(100, Math.round((allocatedTotal / clubBudget.total_budget_cents) * 100)) : 0;
  const chartColors = ['#8c1515', '#3f6e8f', '#b27a2c', '#5d7c63', '#875e8c', '#bf5f4d', '#3f7c7c'];
  const spentByTeam = new Map<string, number>();
  for (const purchase of ((cyclePurchasesData || []) as Array<{ team_id: string; amount_cents: number }>)) {
    spentByTeam.set(purchase.team_id, (spentByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
  }
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
  const totalSpendForSelection = purchases
    .filter((purchase) => (validSelectedTeamId === 'all' ? true : purchase.team_id === validSelectedTeamId))
    .reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const alreadySpentOutsideFilter = Math.max(0, totalSpendForSelection - filteredSpendTotal);
  const trueRemainingAllocated = Math.max(0, filteredAllocatedBudget - totalSpendForSelection);
  const trueRemainingTotal = Math.max(0, filteredTotalBudget - totalSpendForSelection);
  const utilizationPercent =
    filteredAllocatedBudget > 0 ? Math.min(100, Math.round((totalSpendForSelection / filteredAllocatedBudget) * 100)) : 0;
  const selectedTeam = validSelectedTeamId === 'all' ? null : teams.find((team) => team.id === validSelectedTeamId) || null;
  const selectedTeamMemberCount =
    validSelectedTeamId === 'all' ? 0 : (rosterMembersData || []).length + (teamMembershipsData || []).length;
  const selectedTeamPurchases = (selectedTeamPurchasesData || []) as PurchaseLog[];
  const costPerMember =
    selectedTeamMemberCount > 0 ? Math.round(filteredSpendTotal / selectedTeamMemberCount) : 0;
  const categoryColors = {
    equipment: '#8c1515',
    food: '#d17c3f',
    travel: '#3f6e8f',
    prior: '#8c8585',
    unused: '#dfd7d7'
  } as const;
  const categoryTotals = {
    equipment: filteredPurchases
      .filter((purchase) => purchase.category === 'equipment')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    food: filteredPurchases
      .filter((purchase) => purchase.category === 'food')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    travel: filteredPurchases
      .filter((purchase) => purchase.category === 'travel')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0)
  };

  const allocationChartEntries = teams
    .map((team, index) => ({
      id: team.id,
      name: team.name,
      amount: teamBudgets.get(team.id) || 0,
      color: chartColors[index % chartColors.length]
    }))
    .filter((team) => team.amount > 0);

  let cursor = 0;
  const slices: string[] = [];
  const chartEntries =
    validSelectedTeamId === 'all'
      ? allocationChartEntries
      : ([
          { id: 'equipment', name: 'Equipment', amount: categoryTotals.equipment, color: categoryColors.equipment },
          { id: 'food', name: 'Food', amount: categoryTotals.food, color: categoryColors.food },
          { id: 'travel', name: 'Travel', amount: categoryTotals.travel, color: categoryColors.travel }
        ].filter((entry) => entry.amount > 0) as Array<{ id: string; name: string; amount: number; color: string }>);

  if (validSelectedTeamId === 'all') {
    for (const team of chartEntries) {
      const amount = team.amount;
      if (clubBudget.total_budget_cents <= 0 || amount <= 0) {
        continue;
      }

      const start = cursor;
      const end = cursor + (amount / clubBudget.total_budget_cents) * 100;
      cursor = end;
      slices.push(`${team.color} ${start}% ${end}%`);
    }

    if (clubBudget.total_budget_cents > 0 && remainingBudget > 0) {
      slices.push(`#e5e1e1 ${cursor}% 100%`);
    }
  } else {
    for (const entry of chartEntries) {
      if (filteredAllocatedBudget <= 0 || entry.amount <= 0) {
        continue;
      }

      const start = cursor;
      const end = cursor + (entry.amount / filteredAllocatedBudget) * 100;
      cursor = end;
      slices.push(`${entry.color} ${start}% ${end}%`);
    }

    if (filteredAllocatedBudget > 0 && filteredRemainingAllocated > 0) {
      if (alreadySpentOutsideFilter > 0) {
        const spentStart = cursor;
        const spentEnd = cursor + (alreadySpentOutsideFilter / filteredAllocatedBudget) * 100;
        cursor = spentEnd;
        slices.push(`${categoryColors.prior} ${spentStart}% ${spentEnd}%`);
      }

      if (trueRemainingAllocated > 0) {
        slices.push(`${categoryColors.unused} ${cursor}% 100%`);
      }
    }
  }

  const chartBackground = slices.length > 0 ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#e5e1e1 0 100%)';

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : currentRole === 'president' ? 'President' : 'Financial officer'}</p>
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
              <p className="hq-eyebrow">{selectedTeam ? 'Team financial overview' : 'Club financial overview'}</p>
              <h2 className="hq-section-title hq-section-title-compact">{selectedTeam ? selectedTeam.name : cycle}</h2>
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
                  <strong>{selectedTeam ? `${utilizationPercent}%` : `${allocationPercent}%`}</strong>
                  <span>{selectedTeam ? 'used' : 'allocated'}</span>
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
                <span
                  className="hq-finance-callout-line"
                  style={{ color: selectedTeam ? categoryColors.prior : '#8f8888' }}
                  aria-hidden="true"
                />
                <div>
                  <span>{selectedTeam ? 'Already spent' : 'Unallocated'}</span>
                  <strong>${((selectedTeam ? alreadySpentOutsideFilter : remainingBudget) / 100).toLocaleString()}</strong>
                </div>
              </div>
              {selectedTeam ? (
                <div className="hq-finance-callout">
                  <span className="hq-finance-callout-line" style={{ color: categoryColors.unused }} aria-hidden="true" />
                  <div>
                    <span>Remaining</span>
                    <strong>${(trueRemainingAllocated / 100).toLocaleString()}</strong>
                  </div>
                </div>
              ) : null}
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
              <span>{selectedTeam ? 'Team total budget' : 'Total club budget'}</span>
              <strong>${((selectedTeam ? filteredAllocatedBudget : clubBudget.total_budget_cents) / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Spent' : 'Allocated'}</span>
              <strong>${((selectedTeam ? totalSpendForSelection : allocatedTotal) / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Utilization' : 'Unallocated'}</span>
              <strong>{selectedTeam ? `${utilizationPercent}%` : `$${(remainingBudget / 100).toLocaleString()}`}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Cost per member' : 'Filtered spend'}</span>
              <strong>{selectedTeam ? `$${(costPerMember / 100).toLocaleString()}` : `$${(filteredSpendTotal / 100).toLocaleString()}`}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>Avg purchase</span>
              <strong>${(filteredAverageSpend / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Remaining' : 'Utilization'}</span>
              <strong>{selectedTeam ? `$${(trueRemainingAllocated / 100).toLocaleString()}` : `${utilizationPercent}%`}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Spend in selected range' : 'Remaining from allocated'}</span>
              <strong>{selectedTeam ? `$${(filteredSpendTotal / 100).toLocaleString()}` : `$${(trueRemainingAllocated / 100).toLocaleString()}`}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Already spent before range' : 'Remaining from total'}</span>
              <strong>{selectedTeam ? `$${(alreadySpentOutsideFilter / 100).toLocaleString()}` : `$${(trueRemainingTotal / 100).toLocaleString()}`}</strong>
            </div>
            <div className="hq-finance-metric-card">
              <span>{selectedTeam ? 'Members' : 'Teams with spend'}</span>
              <strong>{selectedTeam ? selectedTeamMemberCount : filteredSpentTeams}</strong>
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
              <div key={team.id} className={`hq-team-row${selectedTeam?.id === team.id ? ' hq-team-row-selected' : ''}`}>
                <div className="hq-team-row-head">
                  <Link
                    href={`/dashboard/finances?team=${team.id}&range=${selectedRange}`}
                    className="hq-team-heading hq-team-heading-link"
                  >
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
                  </Link>
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

          {selectedTeam ? (
            <section className="hq-finance-drilldown">
              <div className="hq-block-head">
                <div className="hq-section-head-copy">
                  <p className="hq-eyebrow">Team purchases</p>
                  <h3>{selectedTeam.name}</h3>
                </div>
                <Link href="/dashboard/finances" className="hq-inline-link">
                  Back to all teams
                </Link>
              </div>

              {canLogPurchases ? (
                <section className="hq-question-card">
                  <h3>Add purchase</h3>
                  <ManualPurchaseForm
                    academicYear={cycle}
                    teams={[selectedTeam]}
                    defaultPersonName={profile.full_name || ''}
                  />
                </section>
              ) : null}

              <div className="table-wrap">
                {selectedTeamPurchases.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Amount</th>
                        <th>Person</th>
                        <th>Payment method</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTeamPurchases.map((purchase) => (
                        <tr key={purchase.id}>
                          <td>{new Date(purchase.purchased_at).toLocaleDateString('en-US')}</td>
                          <td style={{ fontWeight: 700 }}>{purchase.description || 'Untitled purchase'}</td>
                          <td>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td>{purchase.person_name || 'Unknown'}</td>
                          <td>{purchase.payment_method ? paymentMethodLabel[purchase.payment_method] : 'Unknown'}</td>
                          <td>{purchase.category ? categoryLabel[purchase.category] : 'Equipment'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="empty-note">No purchases have been logged for {selectedTeam.name} yet.</p>
                )}
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </div>
  );
}
