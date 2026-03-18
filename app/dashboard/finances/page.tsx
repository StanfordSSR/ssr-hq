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
};

export default async function FinancesPage() {
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
    .select('team_id, amount_cents')
    .eq('academic_year', cycle);

  const teams = (teamsData || []) as Team[];
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
  let cursor = 0;
  const slices = teams
    .map((team, index) => {
      const amount = teamBudgets.get(team.id) || 0;
      if (clubBudget.total_budget_cents <= 0 || amount <= 0) {
        return null;
      }

      const start = cursor;
      const end = cursor + (amount / clubBudget.total_budget_cents) * 100;
      cursor = end;
      return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
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

      <div className="hq-lead-dashboard">
        <aside className="hq-panel hq-lead-sidebar hq-surface-muted">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Club budget</p>
              <h2 className="hq-section-title hq-section-title-compact">{cycle}</h2>
            </div>
          </div>

          <div className="hq-budget-ring-wrap hq-budget-ring-wrap-large">
            <div className="hq-budget-ring hq-budget-ring-large" style={{ background: chartBackground } as CSSProperties}>
              <div className="hq-budget-ring-inner hq-budget-ring-inner-large">
                <strong>{allocationPercent}%</strong>
                <span>allocated</span>
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

          <div className="hq-summary-list">
            <div className="hq-summary-row">
              <span>Allocated to teams</span>
              <strong>${(allocatedTotal / 100).toLocaleString()}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Remaining</span>
              <strong>${(remainingBudget / 100).toLocaleString()}</strong>
            </div>
          </div>

          <div className="hq-summary-list">
            {teams.map((team, index) => (
              <div key={team.id} className="hq-summary-row">
                <span style={{ color: chartColors[index % chartColors.length] }}>{team.name}</span>
                <strong>${((teamBudgets.get(team.id) || 0) / 100).toLocaleString()}</strong>
              </div>
            ))}
            <div className="hq-summary-row">
              <span style={{ color: '#8f8888' }}>Remaining</span>
              <strong>${(remainingBudget / 100).toLocaleString()}</strong>
            </div>
          </div>
        </aside>

        <section className="hq-panel hq-lead-main hq-surface-muted">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team allocations</p>
              <h2 className="hq-section-title hq-section-title-compact">Annual budgets</h2>
            </div>
          </div>

          <div className="hq-team-list">
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
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
