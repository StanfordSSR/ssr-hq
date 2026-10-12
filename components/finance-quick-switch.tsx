'use client';

import { createContext, useContext, useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ManualPurchaseForm } from '@/components/manual-purchase-form';
import { PurchaseLedger, type PurchaseLedgerRow } from '@/components/purchase-ledger';
import { buildTeamBuckets } from '@/lib/finance-team-buckets';
import { TeamBudgetBucketList } from '@/components/team-budget-bucket-list';
import type { ChargeCatalog } from '@/lib/budget-charge-routing';
import type { ClubBucket } from '@/lib/finance-overview';

export type QuickTeam = { id: string; name: string; logo_url: string | null };
export type QuickPurchase = {
  id: string;
  team_id: string | null;
  expense_type: 'team' | 'leadership';
  academic_year: string;
  description: string | null;
  amount_cents: number;
  purchased_at: string;
  person_name: string | null;
  payment_method: PurchaseLedgerRow['paymentMethod'] | null;
  category: PurchaseLedgerRow['category'] | null;
  budget_expense_item_id: string | null;
  funding_source_id: string | null;
};
export type QuickPending = {
  id: string;
  team_id: string | null;
  expense_type: 'team' | 'leadership';
  item_name: string;
  submitter_name: string;
  amount_cents: number;
  budget_expense_item_id: string | null;
  funding_source_id: string | null;
};
type QuickData = {
  cycle: string;
  recentCutoffIso: string;
  teams: QuickTeam[];
  teamNames: Record<string, string>;
  budgets: Record<string, number>;
  catalog: ChargeCatalog | null;
  clubBuckets: ClubBucket[];
  cyclePurchases: QuickPurchase[];
  ledgerPurchases: QuickPurchase[];
  pending: QuickPending[];
  leadershipSpentCents: number;
  canLogPurchases: boolean;
  canLogLeadership: boolean;
  profileName: string;
};
type QuickContext = QuickData & {
  teamId: string;
  range: string;
  quick: boolean;
  choose: (teamId: string, range: string) => void;
};

const Context = createContext<QuickContext | null>(null);

function useFinanceQuick() {
  const value = useContext(Context);
  if (!value) throw new Error('Finance quick switch is unavailable.');
  return value;
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function percent(spent: number, cap: number) {
  if (spent <= 0 || cap <= 0) return '0%';
  const value = spent / cap * 100;
  return value < 1 ? '<1%' : `${Math.round(value)}%`;
}

function pacificDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric'
  }).format(new Date(value));
}

function progress(label: string, spent: number, cap: number) {
  return (
    <div className="hq-budget-progress" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={Math.max(cap, 1)} aria-valuenow={Math.min(spent, cap)}>
      <div className={`hq-budget-progress-fill${spent > cap ? ' hq-budget-progress-fill-over' : ''}`}
        style={{ width: `${cap > 0 ? Math.min(100, spent / cap * 100) : 0}%` }} />
    </div>
  );
}

export function FinanceQuickSwitchProvider({
  initialTeam, initialRange, data, children
}: {
  initialTeam: string;
  initialRange: string;
  data: QuickData;
  children: ReactNode;
}) {
  const router = useRouter();
  const [chosenSelection, setSelection] = useState<{ teamId: string; range: string } | null>(null);
  const selection = chosenSelection || { teamId: initialTeam, range: initialRange };
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const requestedTeam = params.get('team') || 'all';
      setSelection({
        teamId: data.teams.some((team) => team.id === requestedTeam) ? requestedTeam : 'all',
        range: params.get('range') || 'current_cycle'
      });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [data.teams]);

  const choose = (teamId: string, range: string) => {
    if (teamId === selection.teamId && range === selection.range) return;
    setSelection({ teamId, range });
    window.history.pushState(null, '', `/dashboard/finances?team=${encodeURIComponent(teamId)}&range=${encodeURIComponent(range)}`);
    router.refresh();
  };
  const context: QuickContext = {
    ...data,
    ...selection,
    quick: selection.teamId !== initialTeam || selection.range !== initialRange,
    choose
  };
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

export function FinanceQuickHeader() {
  const { cycle, teams, teamId, range, choose } = useFinanceQuick();
  const team = teams.find((entry) => entry.id === teamId);
  return (
    <div className="hq-section-head">
      <div className="hq-section-head-copy">
        <p className="hq-eyebrow">{team ? 'Team financial overview' : 'Club financial overview'}</p>
        <h2 className="hq-section-title hq-section-title-compact">{team ? team.name : cycle}</h2>
      </div>
      <div className="hq-finance-filter-bar">
        <select className="select" aria-label="Team" value={teamId} onChange={(event) => choose(event.target.value, range)}>
          <option value="all">All teams</option>
          {teams.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
        <select className="select" aria-label="Purchase range" value={range} onChange={(event) => choose(teamId, event.target.value)}>
          <option value="current_cycle">Current cycle</option>
          <option value="last_90_days">Last 90 days</option>
          <option value="all_time">All time</option>
        </select>
      </div>
    </div>
  );
}

export function FinanceQuickLink({ team }: { team: QuickTeam }) {
  const { teamId, range, choose } = useFinanceQuick();
  const href = `/dashboard/finances?team=${team.id}&range=${range}`;
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    choose(team.id, range);
  };
  return (
    <a href={href} onClick={onClick} className="hq-team-heading hq-team-heading-link"
      aria-current={teamId === team.id ? 'page' : undefined}>
      <div className="hq-team-title-row">
        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-medium" />
        ) : <div className="hq-team-logo hq-team-logo-medium hq-team-logo-fallback">{team.name.slice(0, 1)}</div>}
        <h3>{team.name}</h3>
      </div>
    </a>
  );
}

function QuickBucketRows({ teamId }: { teamId: string }) {
  const { catalog, cyclePurchases, pending } = useFinanceQuick();
  const summary = buildTeamBuckets(
    catalog?.teams[teamId] || [],
    cyclePurchases.filter((row) => row.team_id === teamId),
    pending.filter((row) => row.team_id === teamId)
  );
  return <TeamBudgetBucketList summary={summary} />;
}

export function FinanceQuickOverview({ children }: { children: ReactNode }) {
  const data = useFinanceQuick();
  const { teamId, range, quick, teams, budgets, cyclePurchases, ledgerPurchases, pending, clubBuckets } = data;
  const selectedTeam = teams.find((team) => team.id === teamId);
  const current = selectedTeam ? cyclePurchases.filter((row) => row.team_id === teamId) : cyclePurchases;
  const spent = current.reduce((sum, row) => sum + row.amount_cents, 0);
  const clubBucketTotal = clubBuckets.reduce((sum, row) => sum + row.budgetCents, 0);
  const teamBudgetTotal = teams.reduce((sum, team) => sum + (budgets[team.id] || 0), 0);
  const cap = selectedTeam ? budgets[teamId] || 0 : teamBudgetTotal + clubBucketTotal;
  const totalSpent = selectedTeam ? spent : spent + data.leadershipSpentCents;
  const pendingCents = pending.filter((row) => !selectedTeam || row.team_id === teamId)
    .reduce((sum, row) => sum + row.amount_cents, 0);

  const filtered = ledgerPurchases.filter((row) =>
    (!selectedTeam || row.team_id === teamId && row.expense_type === 'team') &&
    (range === 'all_time' || range === 'last_90_days' && row.purchased_at >= data.recentCutoffIso ||
      range === 'current_cycle' && row.academic_year === data.cycle &&
        row.purchased_at >= `${data.cycle.slice(0, 4)}-09-01T07:00:00Z`)
  );
  const ledgerRows: PurchaseLedgerRow[] = filtered.map((row) => ({
    id: row.id,
    teamName: row.expense_type === 'leadership' ? 'Leadership' : data.teamNames[row.team_id || ''] || 'Unknown team',
    description: row.description || 'Untitled purchase',
    amountCents: row.amount_cents,
    purchasedAt: row.purchased_at,
    personName: row.person_name || 'Unknown',
    paymentMethod: row.payment_method || 'unknown',
    category: row.category || 'equipment'
  }));
  const colors = ['#8c1515', '#3f6e8f', '#b27a2c', '#5d7c63', '#875e8c', '#bf5f4d'];
  const categoryColors: Record<string, string> = {
    equipment: '#8c1515', food: '#d17c3f', travel: '#3f6e8f', registration: '#5b8c5a', other: '#875e8c'
  };
  const chartEntries = selectedTeam
    ? Object.entries(categoryColors).map(([category, color]) => ({
        label: category[0].toUpperCase() + category.slice(1), color,
        amount: current.filter((row) => row.category === category).reduce((sum, row) => sum + row.amount_cents, 0)
      })).filter((row) => row.amount > 0)
    : [
        ...teams.map((team, index) => ({ label: team.name, color: colors[index % colors.length], amount: budgets[team.id] || 0 })),
        { label: 'Club programs', color: '#bf5f4d', amount: clubBucketTotal }
      ].filter((row) => row.amount > 0);
  let cursor = 0;
  const slices = chartEntries.map((row) => {
    const start = cursor;
    cursor = Math.min(100, cursor + (cap > 0 ? row.amount / cap * 100 : 0));
    return `${row.color} ${start}% ${cursor}%`;
  });
  if (selectedTeam && cursor < 100) slices.push(`#dfd7d7 ${cursor}% 100%`);
  const background = slices.length ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#e5e1e1 0 100%)';

  if (!quick) return <>{children}</>;
  return (
    <>
      <aside className="hq-panel hq-lead-sidebar hq-surface-muted hq-finance-overview">
        <FinanceQuickHeader />
        <div className="hq-finance-hero">
          <div className="hq-budget-ring-wrap hq-budget-ring-wrap-large">
            <div className="hq-budget-ring hq-budget-ring-large" style={{ background } as CSSProperties}>
              <div className="hq-budget-ring-inner hq-budget-ring-inner-large">
                <strong>{selectedTeam ? percent(totalSpent, cap) : money(cap)}</strong>
                <span>{selectedTeam ? 'used this cycle' : 'budgeted'}</span>
              </div>
            </div>
          </div>
          <div className="hq-finance-callouts">
            {chartEntries.map((row) => (
              <div className="hq-finance-callout" key={row.label}>
                <span className="hq-finance-swatch" style={{ backgroundColor: row.color }} aria-hidden="true" />
                <span>{row.label}</span><strong>{money(row.amount)}</strong>
              </div>
            ))}
            {selectedTeam && cap > totalSpent ? (
              <div className="hq-finance-callout"><span className="hq-finance-swatch" style={{ backgroundColor: '#dfd7d7' }} aria-hidden="true" />
                <span>Remaining</span><strong>{money(cap - totalSpent)}</strong></div>
            ) : null}
          </div>
        </div>
        {selectedTeam ? <QuickBucketRows teamId={teamId} /> : (
          <section className="hq-finance-buckets" aria-label="Club programs and operations">
            <div className="hq-finance-buckets-head"><h3>Club programs & operations</h3><strong>{money(clubBucketTotal)}</strong></div>
            <div className="hq-finance-bucket-list">
              {clubBuckets.map((bucket) => (
                <div className="hq-finance-bucket" key={bucket.id}>
                  <div className="hq-finance-bucket-line"><span title={bucket.label}>{bucket.label}</span>
                    <strong>{money(bucket.spentCents)} <span className="hq-finance-bucket-cap">/ {money(bucket.budgetCents)}</span></strong></div>
                  {progress(`${bucket.label} spent`, bucket.spentCents, bucket.budgetCents)}
                </div>
              ))}
            </div>
          </section>
        )}
        <div className="hq-finance-metric-grid">
          {[
            [selectedTeam ? 'Annual budget' : 'Total club budget', money(cap)], ['Spent this cycle', money(totalSpent)],
            ['Pending approval', money(pendingCents)], ['Remaining', money(Math.max(0, cap - totalSpent))],
            ['Utilization', percent(totalSpent, cap)]
          ].map(([label, value]) => <div className="hq-finance-metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </aside>
      <PurchaseLedger rows={ledgerRows} showTeam={!selectedTeam}
        title={selectedTeam ? `${selectedTeam.name} purchases` : 'All purchases'}
        subtitle={range === 'current_cycle' ? `Purchases logged in the ${data.cycle} cycle.` : range === 'last_90_days' ? 'Purchases logged in the last 90 days.' : 'Latest purchases, newest first.'} />
    </>
  );
}

export function FinanceQuickDetail({ children }: { children: ReactNode }) {
  const { quick, teamId, teams, cycle, catalog, profileName, canLogPurchases, canLogLeadership, cyclePurchases, ledgerPurchases, pending } = useFinanceQuick();
  if (!quick) return <>{children}</>;
  const team = teams.find((entry) => entry.id === teamId);
  const selectedPending = pending.filter((row) => team ? row.team_id === team.id : row.expense_type === 'leadership');
  const purchases = (team
    ? cyclePurchases.filter((row) => row.team_id === team.id)
    : ledgerPurchases.filter((row) => row.expense_type === 'leadership' && row.academic_year === cycle)
  )
    .sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at)).slice(0, 25);
  return (
    <section className="hq-finance-drilldown">
      <div className="hq-block-head"><div className="hq-section-head-copy"><p className="hq-eyebrow">{team ? 'Team purchases' : 'Leadership / Operations'}</p>
        <h3>{team?.name || 'Club leadership expenses'}</h3></div></div>
      {team && canLogPurchases ? (
        <section className="hq-question-card"><h3>Add purchase</h3>
          <ManualPurchaseForm catalog={catalog} academicYear={cycle} teams={[team]} defaultPersonName={profileName} />
        </section>
      ) : null}
      {!team && canLogLeadership ? (
        <section className="hq-question-card"><h3>Add leadership expense</h3>
          <ManualPurchaseForm catalog={catalog} academicYear={cycle} teams={[]} leadership defaultPersonName={profileName} />
        </section>
      ) : null}
      {selectedPending.length > 0 ? (
        <section className="hq-finance-pending-list">
          <div className="hq-block-head"><h3>Awaiting {team ? 'lead' : 'president'} approval</h3>
            <strong>{money(selectedPending.reduce((sum, row) => sum + row.amount_cents, 0))} pending</strong></div>
          {selectedPending.map((row) => <div className="hq-finance-pending-row" key={row.id}>
            <span>{row.item_name} · {row.submitter_name}</span><strong>{money(row.amount_cents)}</strong>
          </div>)}
          <a href="/dashboard/reimbursements" className="hq-inline-link">Review reimbursements</a>
        </section>
      ) : null}
      <div className="table-wrap">
        {purchases.length > 0 ? (
          <table><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Person</th><th>Payment method</th><th>Category</th></tr></thead>
            <tbody>{purchases.map((row) => <tr key={row.id}><td>{pacificDate(row.purchased_at)}</td>
              <td>{row.description || 'Untitled purchase'}</td><td>{money(row.amount_cents)}</td>
              <td>{row.person_name || 'Unknown'}</td><td>{row.payment_method || 'Unknown'}</td>
              <td>{row.category ? row.category[0].toUpperCase() + row.category.slice(1) : 'Other'}</td></tr>)}</tbody></table>
        ) : <p className="empty-note">No purchases have been logged for {team?.name || 'club leadership'} this cycle.</p>}
      </div>
    </section>
  );
}
