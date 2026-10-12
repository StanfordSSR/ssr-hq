import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getActiveBudgetPlan, getBudgetSetupState } from '@/lib/budget-plan';
import { ManualPurchaseForm } from '@/components/manual-purchase-form';
import { getChargeCatalog } from '@/lib/budget-charge-routing';
import { updateClubBudgetAction, updateTeamBudgetAction } from '@/app/dashboard/actions';
import { InlineBudgetEditor } from '@/components/inline-budget-editor';
import { PurchaseLedger, type PurchaseLedgerRow } from '@/components/purchase-ledger';
import { getViewerContext } from '@/lib/auth';
import { allocatedClubBudgetCents, buildClubBuckets, type FinanceExpense } from '@/lib/finance-overview';
import { buildTeamBuckets } from '@/lib/finance-team-buckets';
import { getBudgetReferenceAliases, remapBudgetReferences } from '@/lib/budget-reference-aliases';
import { TeamBudgetBucketList } from '@/components/team-budget-bucket-list';
import {
  FinanceQuickSwitchProvider, FinanceQuickHeader, FinanceQuickLink,
  FinanceQuickOverview, FinanceQuickDetail,
  type QuickPurchase, type QuickPending
} from '@/components/finance-quick-switch';

type Team = {
  id: string;
  name: string;
  logo_url: string | null;
  is_active: boolean;
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
  category: 'equipment' | 'food' | 'travel' | 'registration' | 'other';
  description?: string;
  person_name?: string | null;
  payment_method?: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  budget_expense_item_id?: string | null;
  funding_source_id?: string | null;
};

type PendingReimbursement = {
  id: string;
  team_id: string | null;
  expense_type: 'team' | 'leadership';
  item_name: string;
  submitter_name: string;
  amount_cents: number;
  created_at: string;
  budget_expense_item_id: string | null;
  funding_source_id: string | null;
};

const paymentMethodLabel: Record<'reimbursement' | 'credit_card' | 'amazon' | 'unknown', string> = {
  credit_card: 'Credit card',
  amazon: 'Amazon',
  reimbursement: 'Reimbursement',
  unknown: 'Unknown'
};

const categoryLabel: Record<'equipment' | 'food' | 'travel' | 'registration' | 'other', string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel',
  registration: 'Registration',
  other: 'Other'
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

// Module scope so the clock read stays out of the component body.
function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function cycleStartIso(academicYear: string) {
  const startYear = Number(academicYear.slice(0, 4));
  return new Date(`${startYear}-09-01T00:00:00-07:00`).toISOString();
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function pacificDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric'
  }).format(new Date(value));
}

function utilizationLabel(spentCents: number, budgetCents: number) {
  if (budgetCents <= 0 || spentCents <= 0) return '0%';
  const percent = (spentCents / budgetCents) * 100;
  return percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}

export default async function FinancesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const admin = createAdminClient();
  const [{ currentRole, profile }, budgetSetup] = await Promise.all([
    getViewerContext(), getBudgetSetupState()
  ]);
  if (
    currentRole !== 'admin' &&
    currentRole !== 'president' &&
    currentRole !== 'vice_president' &&
    currentRole !== 'financial_officer'
  ) {
    redirect('/dashboard');
  }
  const canEdit = currentRole === 'admin';
  const canLogPurchases = currentRole === 'admin' || currentRole === 'financial_officer';

  const cycle = budgetSetup.academicYear;
  const cycleStart = cycleStartIso(cycle);
  const [
    activeBudgetPlan,
    { data: teamsData },
    { data: teamBudgetsData },
    { data: clubBudgetData },
    { data: cyclePurchasesData },
    { data: leadershipCycleData },
    { data: leadershipRecentData },
    { data: pendingReimbursementsData }
  ] = await Promise.all([
    getActiveBudgetPlan(cycle),
    admin.from('teams').select('id, name, logo_url, is_active').order('name'),
    admin.from('team_budgets').select('team_id, academic_year, annual_budget_cents').eq('academic_year', cycle),
    admin.from('club_budgets').select('academic_year, total_budget_cents').eq('academic_year', cycle).maybeSingle(),
    admin.from('purchase_logs')
      .select('id, team_id, expense_type, academic_year, description, amount_cents, purchased_at, person_name, payment_method, category, budget_expense_item_id, funding_source_id')
      .eq('academic_year', cycle).eq('expense_type', 'team').gte('purchased_at', cycleStart),
    admin.from('purchase_logs')
      .select('amount_cents, budget_expense_item_id, funding_source_id')
      .eq('academic_year', cycle).eq('expense_type', 'leadership').gte('purchased_at', cycleStart),
    admin.from('purchase_logs')
      .select('id, description, amount_cents, purchased_at, person_name, payment_method, category')
      .eq('expense_type', 'leadership').order('purchased_at', { ascending: false }).limit(25),
    admin.from('member_reimbursements')
      .select('id, team_id, expense_type, item_name, submitter_name, amount_cents, created_at, budget_expense_item_id, funding_source_id')
      .eq('academic_year', cycle).eq('status', 'pending').gte('created_at', cycleStart)
  ]);
  const planManagesBudgets = activeBudgetPlan?.status === 'approved';
  const canEditBudgets = canEdit && !planManagesBudgets;
  const showPlanCta = budgetSetup.setupState !== 'upcoming';
  const selectedTeamId = readSingle(params.team) || 'all';
  const selectedRange = readSingle(params.range) || 'current_cycle';
  const filteredPurchaseQuery = admin
    .from('purchase_logs')
    .select('team_id, amount_cents, purchased_at, category, academic_year')
    .eq('expense_type', 'team');

  const allTeams = (teamsData || []) as Team[];
  const teams = allTeams.filter((team) => team.is_active);
  const validSelectedTeamId = selectedTeamId === 'all' || teams.some((team) => team.id === selectedTeamId) ? selectedTeamId : 'all';
  if (validSelectedTeamId !== 'all') {
    filteredPurchaseQuery.eq('team_id', validSelectedTeamId);
  }

  if (selectedRange === 'current_cycle') {
    filteredPurchaseQuery.eq('academic_year', cycle).gte('purchased_at', cycleStart);
  } else if (selectedRange === 'last_90_days') {
    filteredPurchaseQuery.gte('purchased_at', daysAgoIso(90));
  }

  const pendingReimbursements = (pendingReimbursementsData || []) as PendingReimbursement[];
  const pendingByTeam = new Map<string, number>();
  for (const reimbursement of pendingReimbursements) {
    if (reimbursement.team_id) {
      pendingByTeam.set(reimbursement.team_id, (pendingByTeam.get(reimbursement.team_id) || 0) + reimbursement.amount_cents);
    }
  }
  const leadershipCycleSpentCents = (leadershipCycleData || []).reduce(
    (sum, entry) => sum + entry.amount_cents,
    0
  );
  const leadershipRecent = (leadershipRecentData || []) as PurchaseLog[];
  const canLogLeadership =
    currentRole === 'admin' ||
    currentRole === 'president' ||
    currentRole === 'vice_president' ||
    currentRole === 'financial_officer';
  const teamBudgets = new Map(
    ((teamBudgetsData || []) as TeamBudget[]).map((entry) => [entry.team_id, entry.annual_budget_cents])
  );
  const clubBudget = (clubBudgetData || { academic_year: cycle, total_budget_cents: 0 }) as ClubBudget;
  // Full purchase rows backing the sortable ledger below the overview panel.
  // Mirrors the active team + range filters, newest first, uncapped (bounded
  // only by a high safety limit).
  const ledgerQuery = admin
    .from('purchase_logs')
    .select('id, team_id, expense_type, academic_year, description, amount_cents, purchased_at, person_name, payment_method, category')
    .order('purchased_at', { ascending: false })
    .limit(1000);
  const [
    chargeCatalog,
    budgetAliases,
    { data: budgetExpensesData, error: budgetExpensesError },
    { data: filteredPurchasesData },
    { data: rosterMembersData },
    { data: selectedTeamPurchasesData },
    { data: teamMembershipsData },
    { data: ledgerData }
  ] =
    await Promise.all([
      getChargeCatalog(cycle, activeBudgetPlan?.id),
      getBudgetReferenceAliases(cycle, activeBudgetPlan?.id),
      activeBudgetPlan?.status === 'approved'
        ? admin.from('budget_expense_items')
            .select('id, kind, team_id, parent_id, label, amount_cents, sort_order')
            .eq('plan_id', activeBudgetPlan.id)
        : Promise.resolve({ data: [], error: null }),
      filteredPurchaseQuery,
      validSelectedTeamId !== 'all'
        ? admin.from('team_roster_members').select('id').eq('team_id', validSelectedTeamId)
        : Promise.resolve({ data: [] }),
      validSelectedTeamId !== 'all'
        ? admin
            .from('purchase_logs')
            .select('id, team_id, description, amount_cents, purchased_at, person_name, payment_method, category')
            .eq('team_id', validSelectedTeamId)
            .eq('academic_year', cycle)
            .gte('purchased_at', cycleStart)
            .order('purchased_at', { ascending: false })
            .limit(25)
        : Promise.resolve({ data: [] }),
      validSelectedTeamId !== 'all'
        ? admin
            .from('team_memberships')
            .select('id')
            .eq('team_id', validSelectedTeamId)
            .eq('is_active', true)
        : Promise.resolve({ data: [] }),
      ledgerQuery
    ]);
  if (budgetExpensesError) throw new Error('Could not load the approved budget buckets.');
  const leadershipPurchases = remapBudgetReferences(
    (leadershipCycleData || []) as Array<{ amount_cents: number; budget_expense_item_id: string | null; funding_source_id: string | null }>,
    budgetAliases
  );
  const clubBuckets = buildClubBuckets((budgetExpensesData || []) as FinanceExpense[], leadershipPurchases);
  const clubBucketTotal = clubBuckets.reduce((sum, bucket) => sum + bucket.budgetCents, 0);
  const clubBucketSpent = clubBuckets.reduce((sum, bucket) => sum + bucket.spentCents, 0);
  const unassignedClubSpent = Math.max(0, leadershipCycleSpentCents - clubBucketSpent);
  const filteredPurchases = (filteredPurchasesData || []) as PurchaseLog[];
  const teamNameById = new Map(allTeams.map((team) => [team.id, team.name]));
  const allLedgerPurchases = (ledgerData || []) as Array<{
    id: string;
    team_id: string | null;
    expense_type: 'team' | 'leadership';
    academic_year: string;
    description: string | null;
    amount_cents: number;
    purchased_at: string;
    person_name: string | null;
    payment_method: PurchaseLog['payment_method'];
    category: PurchaseLog['category'];
  }>;
  const ledgerRows: PurchaseLedgerRow[] = allLedgerPurchases.filter((purchase) =>
    (validSelectedTeamId === 'all' || purchase.team_id === validSelectedTeamId && purchase.expense_type === 'team') &&
    (selectedRange === 'all_time' || selectedRange === 'last_90_days' && purchase.purchased_at >= daysAgoIso(90) ||
      selectedRange === 'current_cycle' && purchase.academic_year === cycle && purchase.purchased_at >= cycleStart)
  ).map((purchase) => ({
    id: purchase.id,
    teamName:
      purchase.expense_type === 'leadership'
        ? 'Leadership'
        : teamNameById.get(purchase.team_id || '') || 'Unknown team',
    description: purchase.description || 'Untitled purchase',
    amountCents: purchase.amount_cents,
    purchasedAt: purchase.purchased_at,
    personName: purchase.person_name || 'Unknown',
    paymentMethod: purchase.payment_method || 'unknown',
    category: purchase.category || 'equipment'
  }));

  const allocatedTotal = allocatedClubBudgetCents(teams, teamBudgets, clubBuckets);
  const teamAllocatedTotal = allocatedTotal - clubBucketTotal;
  const chartColors = ['#8c1515', '#3f6e8f', '#b27a2c', '#5d7c63', '#875e8c', '#bf5f4d', '#3f7c7c'];
  const spentByTeam = new Map<string, number>();
  const cyclePurchases = remapBudgetReferences((cyclePurchasesData || []) as QuickPurchase[], budgetAliases);
  for (const purchase of cyclePurchases) {
    if (purchase.team_id) {
      spentByTeam.set(purchase.team_id, (spentByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
    }
  }
  const clubSpent = cyclePurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0) + leadershipCycleSpentCents;
  const clubRemaining = Math.max(0, allocatedTotal - clubSpent);
  const filteredSpendTotal = filteredPurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const filteredPurchaseCount = filteredPurchases.length;
  const filteredAverageSpend = filteredPurchaseCount > 0 ? Math.round(filteredSpendTotal / filteredPurchaseCount) : 0;
  const filteredAllocatedBudget = validSelectedTeamId === 'all' ? allocatedTotal : teamBudgets.get(validSelectedTeamId) || 0;
  const selectedCyclePurchases = cyclePurchases.filter((purchase) =>
    validSelectedTeamId === 'all' || purchase.team_id === validSelectedTeamId
  );
  const totalSpendForSelection = selectedCyclePurchases
    .reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const trueRemainingAllocated = Math.max(0, filteredAllocatedBudget - totalSpendForSelection);
  const selectedTeam = validSelectedTeamId === 'all' ? null : teams.find((team) => team.id === validSelectedTeamId) || null;
  const routedPendingReimbursements = remapBudgetReferences(pendingReimbursements, budgetAliases);
  const selectedPending = selectedTeam
    ? routedPendingReimbursements.filter((row) => row.team_id === selectedTeam.id)
    : routedPendingReimbursements;
  const selectedPendingCents = selectedPending.reduce((sum, row) => sum + row.amount_cents, 0);
  const teamBuckets = selectedTeam
    ? buildTeamBuckets(
        chargeCatalog?.teams[selectedTeam.id] || [],
        selectedCyclePurchases,
        selectedPending
      )
    : null;
  const selectedTeamMemberCount =
    validSelectedTeamId === 'all' ? 0 : (rosterMembersData || []).length + (teamMembershipsData || []).length;
  const selectedTeamPurchases = (selectedTeamPurchasesData || []) as PurchaseLog[];
  const costPerMember =
    selectedTeamMemberCount > 0 ? Math.round(filteredSpendTotal / selectedTeamMemberCount) : 0;
  const categoryColors = {
    equipment: '#8c1515',
    food: '#d17c3f',
    travel: '#3f6e8f',
    registration: '#5b8c5a',
    other: '#875e8c',
    unused: '#dfd7d7'
  } as const;
  const categoryTotals = {
    equipment: selectedCyclePurchases
      .filter((purchase) => purchase.category === 'equipment')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    food: selectedCyclePurchases
      .filter((purchase) => purchase.category === 'food')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    travel: selectedCyclePurchases
      .filter((purchase) => purchase.category === 'travel')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    registration: selectedCyclePurchases
      .filter((purchase) => purchase.category === 'registration')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    other: selectedCyclePurchases
      .filter((purchase) => purchase.category === 'other')
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
  if (clubBucketTotal > 0) {
    allocationChartEntries.push({ id: 'club', name: 'Club programs', amount: clubBucketTotal, color: '#bf5f4d' });
  }

  let cursor = 0;
  const slices: string[] = [];
  const chartEntries =
    validSelectedTeamId === 'all'
      ? allocationChartEntries
      : ([
          { id: 'equipment', name: 'Equipment', amount: categoryTotals.equipment, color: categoryColors.equipment },
          { id: 'food', name: 'Food', amount: categoryTotals.food, color: categoryColors.food },
          { id: 'travel', name: 'Travel', amount: categoryTotals.travel, color: categoryColors.travel },
          { id: 'registration', name: 'Registration', amount: categoryTotals.registration, color: categoryColors.registration },
          { id: 'other', name: 'Other', amount: categoryTotals.other, color: categoryColors.other }
        ].filter((entry) => entry.amount > 0) as Array<{ id: string; name: string; amount: number; color: string }>);

  if (validSelectedTeamId === 'all') {
    for (const team of chartEntries) {
      const amount = team.amount;
      if (allocatedTotal <= 0 || amount <= 0) {
        continue;
      }

      const start = cursor;
      const end = Math.min(100, cursor + (amount / allocatedTotal) * 100);
      cursor = end;
      slices.push(`${team.color} ${start}% ${end}%`);
    }
  } else {
    for (const entry of chartEntries) {
      if (filteredAllocatedBudget <= 0 || entry.amount <= 0) {
        continue;
      }

      const start = cursor;
      const end = Math.min(100, cursor + (entry.amount / filteredAllocatedBudget) * 100);
      cursor = end;
      slices.push(`${entry.color} ${start}% ${end}%`);
    }

    if (filteredAllocatedBudget > 0 && trueRemainingAllocated > 0) {
      slices.push(`${categoryColors.unused} ${cursor}% 100%`);
    }
  }

  const chartBackground = slices.length > 0 ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(#e5e1e1 0 100%)';
  const overviewMetrics = selectedTeam
    ? [
        { label: 'Annual budget', value: money(filteredAllocatedBudget) },
        { label: 'Spent this cycle', value: money(totalSpendForSelection) },
        { label: 'Pending approval', value: money(selectedPendingCents) },
        { label: 'Remaining', value: money(trueRemainingAllocated) },
        { label: 'Utilization', value: utilizationLabel(totalSpendForSelection, filteredAllocatedBudget) },
        { label: 'Members', value: String(selectedTeamMemberCount) },
        { label: 'Cost per member', value: money(costPerMember) }
      ]
    : [
        { label: 'Total club budget', value: money(allocatedTotal) },
        { label: 'Team budgets', value: money(teamAllocatedTotal) },
        { label: 'Club buckets', value: money(clubBucketTotal) },
        { label: 'Spent this cycle', value: money(clubSpent) },
        { label: 'Pending approval', value: money(selectedPendingCents) },
        { label: 'Remaining', value: money(clubRemaining) },
        { label: 'Utilization', value: utilizationLabel(clubSpent, allocatedTotal) }
      ];
  if (selectedRange !== 'current_cycle') {
    overviewMetrics.push({ label: 'Team spend in selected range', value: money(filteredSpendTotal) });
    overviewMetrics.push({ label: 'Average purchase in range', value: money(filteredAverageSpend) });
  }

  const quickData = {
    cycle,
    recentCutoffIso: daysAgoIso(90),
    teams,
    teamNames: Object.fromEntries(teamNameById),
    budgets: Object.fromEntries(teamBudgets),
    catalog: chargeCatalog,
    clubBuckets,
    cyclePurchases,
    ledgerPurchases: allLedgerPurchases.map((purchase) => ({
      ...purchase, budget_expense_item_id: null, funding_source_id: null
    })) as QuickPurchase[],
    pending: routedPendingReimbursements as QuickPending[],
    leadershipSpentCents: leadershipCycleSpentCents,
    canLogPurchases,
    canLogLeadership,
    profileName: profile.full_name || ''
  };

  return (
    <div className="hq-page th-page hq-finance-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : currentRole === 'president' ? 'President' : currentRole === 'vice_president' ? 'Vice president' : 'Financial officer'}</p>
          <h1 className="hq-page-title">Manage finances</h1>
          <p className="hq-subtitle">
            {planManagesBudgets
              ? 'Track spending against the approved team and club allocations for the current cycle.'
              : canEdit
                ? 'Set team budgets and track current-cycle spending.'
                : 'Review allocations and current-cycle spending.'}
          </p>
        </div>
      </section>

      {showPlanCta ? (
        <section className="hq-panel hq-surface-muted hq-budget-cta">
          <div className="hq-block-head">
            <h3>{planManagesBudgets ? 'Budgets are managed by the approved plan' : `Plan the ${budgetSetup.nextAcademicYear} budget`}</h3>
          </div>
          <p className="helper">
            {planManagesBudgets
              ? 'Team and club budgets below come from the approved budget plan. Edit them in the planner.'
              : budgetSetup.message}
          </p>
          <div className="button-row">
            <Link href="/dashboard/finances/plan" className="button">
              Open budget plan
            </Link>
          </div>
        </section>
      ) : null}

      <FinanceQuickSwitchProvider initialTeam={validSelectedTeamId} initialRange={selectedRange} data={quickData}>
      <div className="hq-finance-layout">
        <div className="hq-finance-column">
        <FinanceQuickOverview>
        <aside className="hq-panel hq-lead-sidebar hq-surface-muted hq-finance-overview">
          <FinanceQuickHeader />

          <div className="hq-finance-hero">
            <div className="hq-budget-ring-wrap hq-budget-ring-wrap-large">
              <div className="hq-budget-ring hq-budget-ring-large" style={{ background: chartBackground } as CSSProperties}>
                <div className="hq-budget-ring-inner hq-budget-ring-inner-large">
                  <strong>{selectedTeam ? utilizationLabel(totalSpendForSelection, filteredAllocatedBudget) : money(allocatedTotal)}</strong>
                  <span>{selectedTeam ? 'used this cycle' : 'budgeted'}</span>
                </div>
              </div>
            </div>

            <div className="hq-finance-callouts">
              {chartEntries.map((entry) => (
                <div key={entry.id} className="hq-finance-callout">
                  <span className="hq-finance-swatch" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                  <span>{entry.name}</span>
                  <strong>{money(entry.amount)}</strong>
                </div>
              ))}
              {selectedTeam && trueRemainingAllocated > 0 ? (
                <div className="hq-finance-callout">
                  <span className="hq-finance-swatch" style={{ backgroundColor: categoryColors.unused }} aria-hidden="true" />
                  <span>Remaining</span>
                  <strong>{money(trueRemainingAllocated)}</strong>
                </div>
              ) : null}
              {chartEntries.length === 0 && !selectedTeam ? <p className="empty-note">No budget allocations yet.</p> : null}
            </div>
          </div>

          {selectedTeam && teamBuckets ? <TeamBudgetBucketList summary={teamBuckets} /> : null}

          {!selectedTeam && clubBuckets.length > 0 ? (
            <section className="hq-finance-buckets" aria-labelledby="club-buckets-heading">
              <div className="hq-finance-buckets-head">
                <h3 id="club-buckets-heading">Club programs & operations</h3>
                <strong>{money(clubBucketTotal)}</strong>
              </div>
              <div className="hq-finance-bucket-list">
                {clubBuckets.map((bucket) => (
                  <div className="hq-finance-bucket" key={bucket.id}>
                    <div className="hq-finance-bucket-line">
                      <span title={bucket.label}>{bucket.label}</span>
                      <strong>{money(bucket.spentCents)} <span className="hq-finance-bucket-cap">/ {money(bucket.budgetCents)}</span></strong>
                    </div>
                    <div
                      className="hq-budget-progress"
                      role="progressbar"
                      aria-label={`${bucket.label} spent`}
                      aria-valuemin={0}
                      aria-valuemax={bucket.budgetCents}
                      aria-valuenow={Math.min(bucket.budgetCents, bucket.spentCents)}
                    >
                      <div
                        className={`hq-budget-progress-fill${bucket.spentCents > bucket.budgetCents ? ' hq-budget-progress-fill-over' : ''}`}
                        style={{ width: `${Math.min(100, (bucket.spentCents / bucket.budgetCents) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {unassignedClubSpent > 0 ? (
                <p className="hq-finance-unassigned">{money(unassignedClubSpent)} in club spending is not assigned to a budget bucket.</p>
              ) : null}
            </section>
          ) : null}

          {canEditBudgets ? (
            <InlineBudgetEditor
              action={updateClubBudgetAction}
              academicYear={cycle}
              fieldName="total_budget"
              label="Funding available"
              value={clubBudget.total_budget_cents / 100}
              confirmMessage="Update the total club budget for this cycle?"
            />
          ) : null}

          <div className="hq-finance-metric-grid">
            {overviewMetrics.map((metric) => (
              <div className="hq-finance-metric-card" key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </aside>

        <PurchaseLedger
          rows={ledgerRows}
          showTeam={validSelectedTeamId === 'all'}
          title={selectedTeam ? `${selectedTeam.name} purchases` : 'All purchases'}
          subtitle={
            selectedRange === 'current_cycle'
              ? `Every purchase logged in the ${cycle} cycle, newest first. Click a column to sort.`
              : selectedRange === 'last_90_days'
                ? 'Every purchase logged in the last 90 days, newest first. Click a column to sort.'
                : 'Every purchase ever logged, newest first. Click a column to sort.'
          }
        />
        </FinanceQuickOverview>
        </div>

        <section className="hq-panel hq-lead-main hq-surface-muted hq-finance-allocations">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team allocations</p>
              <h2 className="hq-section-title hq-section-title-compact">Annual budgets</h2>
            </div>
          </div>

          <div className="hq-team-list hq-team-list-compact">
            {teams.map((team) => {
              const budgetCents = teamBudgets.get(team.id) || 0;
              const spentCents = spentByTeam.get(team.id) || 0;
              return (
                <div key={team.id} className="hq-team-row">
                  <div className="hq-finance-team-top">
                    <FinanceQuickLink team={team} />
                    <div className="hq-finance-team-amount">
                      {canEditBudgets ? (
                        <InlineBudgetEditor
                          action={updateTeamBudgetAction}
                          academicYear={cycle}
                          hiddenName="team_id"
                          hiddenValue={team.id}
                          fieldName="annual_budget"
                          label="Annual budget"
                          value={budgetCents / 100}
                          confirmMessage={`Update the annual budget for ${team.name}?`}
                        />
                      ) : (
                        <div>
                          <span>Annual budget</span>
                          <strong>{money(budgetCents)}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="hq-finance-team-spend">
                    <span>Spent <strong>{money(spentCents)}</strong></span>
                    <span>
                      {budgetCents === 0
                        ? spentCents > 0 ? 'Unbudgeted spend' : 'No allocation'
                        : spentCents > budgetCents
                          ? `${money(spentCents - budgetCents)} over`
                          : `${utilizationLabel(spentCents, budgetCents)} used`}
                    </span>
                  </div>
                  {(pendingByTeam.get(team.id) || 0) > 0 ? (
                    <p className="hq-finance-pending-note">{money(pendingByTeam.get(team.id) || 0)} pending approval</p>
                  ) : null}
                  <div
                    className="hq-budget-progress"
                    role="progressbar"
                    aria-label={`${team.name} budget spent`}
                    aria-valuemin={0}
                    aria-valuemax={Math.max(budgetCents, 1)}
                    aria-valuenow={Math.min(budgetCents, spentCents)}
                  >
                    <div
                      className={`hq-budget-progress-fill${spentCents > budgetCents ? ' hq-budget-progress-fill-over' : ''}`}
                      style={{ width: `${budgetCents > 0 ? Math.min(100, (spentCents / budgetCents) * 100) : 0}%` }}
                    />
                  </div>
              </div>
              );
            })}
          </div>

          <FinanceQuickDetail>
          {!selectedTeam ? (
            <section className="hq-finance-drilldown">
              <div className="hq-block-head">
                <div className="hq-section-head-copy">
                  <p className="hq-eyebrow">Leadership / Operations</p>
                  <h3>Club leadership expenses</h3>
                </div>
                <strong>${(leadershipCycleSpentCents / 100).toLocaleString()} this cycle</strong>
              </div>

              <p className="helper">
                Operations spending that is not tied to a specific team. Visible to financial officers, presidents,
                and admins.
              </p>

              {canLogLeadership ? (
                <section className="hq-question-card">
                  <h3>Add leadership expense</h3>
                  <ManualPurchaseForm
                    catalog={chargeCatalog}
                    academicYear={cycle}
                    teams={[]}
                    leadership
                    defaultPersonName={profile.full_name || ''}
                  />
                </section>
              ) : null}

              <div className="table-wrap">
                {leadershipRecent.length > 0 ? (
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
                      {leadershipRecent.map((purchase) => (
                        <tr key={purchase.id}>
                          <td>{pacificDate(purchase.purchased_at)}</td>
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
                  <p className="empty-note">No leadership expenses have been logged for {cycle} yet.</p>
                )}
              </div>
            </section>
          ) : null}

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
                    catalog={chargeCatalog}
                    academicYear={cycle}
                    teams={[selectedTeam]}
                    defaultPersonName={profile.full_name || ''}
                  />
                </section>
              ) : null}

              {selectedPending.length > 0 ? (
                <section className="hq-finance-pending-list">
                  <div className="hq-block-head">
                    <h3>Awaiting lead approval</h3>
                    <strong>{money(selectedPendingCents)} pending</strong>
                  </div>
                  {selectedPending.map((row) => (
                    <div className="hq-finance-pending-row" key={row.id}>
                      <span>{row.item_name} · {row.submitter_name}</span>
                      <strong>{money(row.amount_cents)}</strong>
                    </div>
                  ))}
                  <Link href="/dashboard/reimbursements" className="hq-inline-link">Review reimbursements</Link>
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
                          <td>{pacificDate(purchase.purchased_at)}</td>
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
          </FinanceQuickDetail>
        </section>
      </div>
      </FinanceQuickSwitchProvider>
    </div>
  );
}
