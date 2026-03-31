import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getCurrentAcademicYear, formatAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { ClearExpenseLogForm } from '@/components/clear-expense-log-form';
import { PurchaseCategoryForm } from '@/components/purchase-category-form';
import { ReceiptUploadForm } from '@/components/receipt-upload-form';
import { PurchaseEntryActions } from '@/components/purchase-entry-actions';
import { getReceiptLinks } from '@/lib/receipt-workflow';
import { getReceiptTaskState } from '@/lib/purchases';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';

type Team = {
  id: string;
  name: string;
};

type TeamBudget = {
  team_id: string;
  academic_year: string;
  annual_budget_cents: number;
};

type Purchase = {
  id: string;
  team_id: string;
  academic_year: string;
  description: string;
  amount_cents: number;
  purchased_at: string;
  person_name: string | null;
  payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  category: 'equipment' | 'food' | 'travel';
  receipt_path: string | null;
  receipt_file_name: string | null;
  receipt_not_needed: boolean;
};

const paymentMethodLabel: Record<Purchase['payment_method'], string> = {
  reimbursement: 'Reimbursement',
  credit_card: 'Credit card',
  amazon: 'Amazon',
  unknown: 'Unknown'
};

const categoryLabel: Record<Purchase['category'], string> = {
  equipment: 'Equipment',
  food: 'Food',
  travel: 'Travel'
};

const categoryColors: Record<Purchase['category'] | 'unused', string> = {
  equipment: '#8c1515',
  food: '#d17c3f',
  travel: '#3f6e8f',
  unused: '#dfd7d7'
};

const pageSize = 10;

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function buildQueryString(current: Record<string, string>, updates: Record<string, string>) {
  const params = new URLSearchParams(current);

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  return params.toString();
}

export default async function ExpenseLogPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const admin = createAdminClient();
  const { user, profile: me, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isPresident = currentRole === 'president';
  const isFinancialOfficer = currentRole === 'financial_officer';
  const isReadOnlyFinanceViewer = isPresident || isFinancialOfficer;
  const isPrivilegedViewer = isAdmin || isReadOnlyFinanceViewer;
  const myTeamIds = isPrivilegedViewer ? [] : await getLeadTeamIds(user.id);
  const { data: teamsData } = isPrivilegedViewer
    ? await admin.from('teams').select('id, name').order('name')
    : await admin.from('teams').select('id, name').in('id', myTeamIds).order('name');
  const teams = (teamsData || []) as Team[];

  if (teams.length === 0) {
    redirect('/dashboard');
  }

  const currentCycle = await getCurrentAcademicYear();
  const rawTeam = readSingle(params.team);
  const defaultTeamSelection = isPrivilegedViewer ? 'all' : teams[0]!.id;
  const selectedTeamId =
    rawTeam === 'all' || teams.some((team) => team.id === rawTeam) ? rawTeam || defaultTeamSelection : defaultTeamSelection;
  const rawRange = readSingle(params.range) || 'current_cycle';
  const rawAcademicYear = readSingle(params.academic_year);
  const currentPage = Math.max(1, Number(readSingle(params.page) || 1));
  const selectedTeamIds =
    selectedTeamId === 'all' ? teams.map((team) => team.id) : teams.filter((team) => team.id === selectedTeamId).map((team) => team.id);

  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select(
      'id, team_id, academic_year, description, amount_cents, purchased_at, person_name, payment_method, category, receipt_path, receipt_file_name, receipt_not_needed'
    )
    .in('team_id', selectedTeamIds)
    .order('purchased_at', { ascending: false });
  const purchases = (purchasesData || []) as Purchase[];

  const academicYearOptions = Array.from(new Set(purchases.map((purchase) => purchase.academic_year)))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const selectedAcademicYear =
    rawRange === 'academic_year'
      ? academicYearOptions.find((year) => year === rawAcademicYear) || academicYearOptions[0] || currentCycle
      : currentCycle;

  const pendingReceiptPurchases = purchases
    .filter((purchase) => {
      const receiptState = getReceiptTaskState({
        paymentMethod: purchase.payment_method,
        purchasedAt: purchase.purchased_at,
        receiptPath: purchase.receipt_path,
        receiptNotNeeded: purchase.receipt_not_needed
      });
      return receiptState.pending;
    })
    .sort((a, b) => {
      const aState = getReceiptTaskState({
        paymentMethod: a.payment_method,
        purchasedAt: a.purchased_at,
        receiptPath: a.receipt_path,
        receiptNotNeeded: a.receipt_not_needed
      });
      const bState = getReceiptTaskState({
        paymentMethod: b.payment_method,
        purchasedAt: b.purchased_at,
        receiptPath: b.receipt_path,
        receiptNotNeeded: b.receipt_not_needed
      });

      if (aState.overdue !== bState.overdue) {
        return aState.overdue ? -1 : 1;
      }

      return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
    });

  const filteredPurchases = purchases.filter((purchase) => {
    if (rawRange === 'all_time') {
      return true;
    }

    if (rawRange === 'last_90_days') {
      return new Date(purchase.purchased_at).getTime() >= Date.now() - 90 * 24 * 60 * 60 * 1000;
    }

    if (rawRange === 'academic_year') {
      return purchase.academic_year === selectedAcademicYear;
    }

    return purchase.academic_year === currentCycle;
  });

  const chartBudgetYear = rawRange === 'academic_year' ? selectedAcademicYear : currentCycle;
  const budgetYearPurchases = purchases.filter((purchase) => purchase.academic_year === chartBudgetYear);
  const { data: teamBudgetsData } = await admin
    .from('team_budgets')
    .select('team_id, academic_year, annual_budget_cents')
    .eq('academic_year', chartBudgetYear)
    .in('team_id', selectedTeamIds);
  const teamBudgets = (teamBudgetsData || []) as TeamBudget[];
  const allocatedBudgetCents = teamBudgets.reduce((sum, budget) => sum + budget.annual_budget_cents, 0);
  const { data: clubBudgetData } = await admin
    .from('club_budgets')
    .select('total_budget_cents')
    .eq('academic_year', chartBudgetYear)
    .maybeSingle();
  const clubBudgetTotalCents = clubBudgetData?.total_budget_cents || 0;
  const budgetTotalCents =
    isPrivilegedViewer && selectedTeamId === 'all' ? clubBudgetTotalCents : allocatedBudgetCents;

  const summaryPurchases = filteredPurchases;
  const totalSpentCents = budgetYearPurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const spendInRangeCents = summaryPurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);
  const alreadySpentBeforeRangeCents = Math.max(0, totalSpentCents - spendInRangeCents);
  const remainingBudgetCents = Math.max(0, budgetTotalCents - totalSpentCents);
  const remainingAllocatedCents = Math.max(0, allocatedBudgetCents - totalSpentCents);
  const spentPercent = budgetTotalCents > 0 ? Math.min(100, Math.round((totalSpentCents / budgetTotalCents) * 100)) : 0;

  const categoryTotals = {
    equipment: summaryPurchases
      .filter((purchase) => purchase.category === 'equipment')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    food: summaryPurchases
      .filter((purchase) => purchase.category === 'food')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0),
    travel: summaryPurchases
      .filter((purchase) => purchase.category === 'travel')
      .reduce((sum, purchase) => sum + purchase.amount_cents, 0)
  };

  const pieSlices: string[] = [];
  let cursor = 0;
  for (const [key, amount] of Object.entries(categoryTotals) as Array<[Purchase['category'], number]>) {
    if (budgetTotalCents <= 0 || amount <= 0) {
      continue;
    }

    const next = cursor + (amount / budgetTotalCents) * 100;
    pieSlices.push(`${categoryColors[key]} ${cursor}% ${next}%`);
    cursor = next;
  }

  if (budgetTotalCents > 0 && alreadySpentBeforeRangeCents > 0) {
    const next = cursor + (alreadySpentBeforeRangeCents / budgetTotalCents) * 100;
    pieSlices.push(`#b7aaaa ${cursor}% ${next}%`);
    cursor = next;
  }

  if (budgetTotalCents > 0 && remainingBudgetCents > 0) {
    pieSlices.push(`${categoryColors.unused} ${cursor}% 100%`);
  }

  const chartBackground =
    pieSlices.length > 0 ? `conic-gradient(${pieSlices.join(', ')})` : 'conic-gradient(#dfd7d7 0 100%)';

  const nonPendingPurchases = filteredPurchases.filter((purchase) => {
    const receiptState = getReceiptTaskState({
      paymentMethod: purchase.payment_method,
      purchasedAt: purchase.purchased_at,
      receiptPath: purchase.receipt_path,
      receiptNotNeeded: purchase.receipt_not_needed
    });
    return !receiptState.pending;
  });
  const totalPages = Math.max(1, Math.ceil(nonPendingPurchases.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const pagedPurchases = nonPendingPurchases.slice((page - 1) * pageSize, page * pageSize);
  const receiptLinks = await getReceiptLinks(pagedPurchases.map((purchase) => purchase.receipt_path));

  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));
  const selectedTeamName =
    selectedTeamId === 'all' ? 'All accessible teams' : teamNameMap.get(selectedTeamId) || 'Your team';
  const currentParamState = {
    team: selectedTeamId,
    range: rawRange,
    academic_year: rawRange === 'academic_year' ? selectedAcademicYear : '',
    page: String(page)
  };

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{isAdmin ? 'Admin' : isPresident ? 'President' : isFinancialOfficer ? 'Financial officer' : 'Lead portal'}</p>
          <h1 className="hq-page-title">
            {isPrivilegedViewer ? 'Expense log' : `${selectedTeamName} expense log`}
          </h1>
          <p className="hq-subtitle">
            {isReadOnlyFinanceViewer
              ? 'Review every recorded purchase, receipt status, and spending distribution with read-only access.'
              : 'Review every recorded purchase, keep receipts current, and track how spending is distributed.'}
          </p>
        </div>
      </section>

      <section className="hq-expense-overview">
        <div className="hq-panel hq-surface-muted hq-expense-summary">
          <div className="hq-block-head">
            <h3>Spending snapshot</h3>
            <span className="hq-inline-note">{chartBudgetYear} budget view</span>
          </div>

          <div className="hq-expense-summary-grid">
            <div className="hq-expense-chart">
              {!isPrivilegedViewer ? <div className="hq-expense-chart-label">{selectedTeamName}</div> : null}
              <div className="hq-budget-ring hq-budget-ring-large" style={{ background: chartBackground }}>
                <div className="hq-budget-ring-inner hq-budget-ring-inner-large">
                  <strong>{spentPercent}%</strong>
                  <span>used</span>
                </div>
              </div>

              <div className="hq-expense-legend">
                <div>
                  <span style={{ color: categoryColors.equipment }}>Equipment</span>
                  <strong>${(categoryTotals.equipment / 100).toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: categoryColors.food }}>Food</span>
                  <strong>${(categoryTotals.food / 100).toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ color: categoryColors.travel }}>Travel</span>
                  <strong>${(categoryTotals.travel / 100).toLocaleString()}</strong>
                </div>
                {alreadySpentBeforeRangeCents > 0 ? (
                  <div>
                    <span style={{ color: '#8f8181' }}>Already spent</span>
                    <strong>${(alreadySpentBeforeRangeCents / 100).toLocaleString()}</strong>
                  </div>
                ) : null}
                <div>
                  <span style={{ color: categoryColors.unused }}>Unused</span>
                  <strong>${(remainingBudgetCents / 100).toLocaleString()}</strong>
                </div>
              </div>
            </div>

            <div className="hq-expense-metrics">
              <div className="hq-purchase-stat">
                <span>{isPrivilegedViewer ? 'Total club budget' : 'Team budget'}</span>
                <strong>
                  $
                  {((isPrivilegedViewer ? clubBudgetTotalCents : allocatedBudgetCents) / 100).toLocaleString(undefined, {
                    minimumFractionDigits: 2
                  })}
                </strong>
              </div>
              {isPrivilegedViewer ? (
                <div className="hq-purchase-stat">
                  <span>Allocated</span>
                  <strong>${(allocatedBudgetCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
              ) : null}
              <div className="hq-purchase-stat">
                <span>{rawRange === 'last_90_days' ? 'Spent in range' : 'Spent'}</span>
                <strong>${(spendInRangeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="hq-purchase-stat">
                <span>Remaining from total</span>
                <strong>${(remainingBudgetCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="hq-purchase-stat">
                <span>Remaining from allocated</span>
                <strong>${(remainingAllocatedCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="hq-purchase-stat">
                <span>Spent prior to time range</span>
                <strong>${(alreadySpentBeforeRangeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
              </div>
              <div className="hq-purchase-stat">
                <span>Pending receipts</span>
                <strong>{pendingReceiptPurchases.length}</strong>
              </div>

              <div className="hq-budget-progress">
                <div className="hq-budget-progress-fill" style={{ width: `${spentPercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        <aside className="hq-panel hq-surface-muted hq-expense-filters">
          <div className="hq-block-head">
            <h3>Filters</h3>
          </div>

          <form className="form-stack" method="get">
            {isPrivilegedViewer ? (
              <div className="field">
                <label className="label" htmlFor="expense-team">
                  Team
                </label>
                <select className="select" id="expense-team" name="team" defaultValue={selectedTeamId}>
                  <option value="all">All accessible teams</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label className="label" htmlFor="expense-range">
                Time range
              </label>
              <select className="select" id="expense-range" name="range" defaultValue={rawRange}>
                <option value="current_cycle">Current academic year</option>
                <option value="last_90_days">Last 90 days</option>
                <option value="academic_year">Specific academic year</option>
                <option value="all_time">All time</option>
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="expense-academic-year">
                Academic year
              </label>
              <select
                className="select"
                id="expense-academic-year"
                name="academic_year"
                defaultValue={selectedAcademicYear}
              >
                {(academicYearOptions.length > 0 ? academicYearOptions : [currentCycle]).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <span className="helper">Used when the time range is set to a specific academic year.</span>
            </div>

            <div className="button-row">
              <button className="button-secondary" type="submit">
                Apply filters
              </button>
            </div>
          </form>

          {!isPrivilegedViewer && selectedTeamId !== 'all' ? (
            <div className="hq-danger-zone">
              <div className="hq-block-head">
                <h3>Danger zone</h3>
              </div>
              <p className="helper">Clear the full expense log for this team only after confirming twice.</p>
              <ClearExpenseLogForm
                teamId={selectedTeamId}
                teamName={teamNameMap.get(selectedTeamId) || 'this team'}
              />
            </div>
          ) : null}
        </aside>
      </section>

      {!isReadOnlyFinanceViewer && pendingReceiptPurchases.length > 0 ? (
        <section className="hq-panel hq-surface-muted hq-pending-section">
          <div className="hq-block-head">
            <h3>Pending receipt uploads</h3>
            <span className="hq-inline-note">Always shown</span>
          </div>

          <div className="hq-task-stack">
            {pendingReceiptPurchases.map((purchase) => {
              const receiptState = getReceiptTaskState({
                paymentMethod: purchase.payment_method,
                purchasedAt: purchase.purchased_at,
                receiptPath: purchase.receipt_path,
                receiptNotNeeded: purchase.receipt_not_needed
              });

              return (
                <article
                  key={purchase.id}
                  className={`hq-task-card hq-task-card-receipt ${receiptState.overdue ? 'hq-task-card-alert' : ''}`}
                >
                  <div className="hq-task-card-head">
                    <div>
                      <span className="hq-task-kicker">Receipt task</span>
                      <h4>Upload receipt for {purchase.description}</h4>
                    </div>
                    {receiptState.overdue ? <strong className="hq-task-alert">OVERDUE</strong> : null}
                  </div>

                  <div className="hq-task-card-meta">
                    <span>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</span>
                    <span>{formatDateLabel(new Date(purchase.purchased_at))}</span>
                    <span>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>

                  <p>
                    {receiptState.overdue
                      ? `This receipt is ${receiptState.ageDays} days old and now overdue.`
                      : 'Upload the receipt as soon as possible so your expense log stays complete.'}
                  </p>

                  {!isReadOnlyFinanceViewer ? <ReceiptUploadForm purchaseId={purchase.id} compact /> : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h3>All purchases</h3>
          <span className="hq-inline-note">{nonPendingPurchases.length} matching entries</span>
        </div>

        {pagedPurchases.length > 0 ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Person</th>
                    <th>Method</th>
                    <th>Category</th>
                    <th>Receipt</th>
                    <th>Team</th>
                    {!isReadOnlyFinanceViewer ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedPurchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                      <td style={{ fontWeight: 700 }}>{purchase.description}</td>
                      <td>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>{purchase.person_name || 'Unknown'}</td>
                    <td>{paymentMethodLabel[purchase.payment_method]}</td>
                    <td>
                      {!isReadOnlyFinanceViewer ? (
                        <PurchaseCategoryForm purchaseId={purchase.id} category={purchase.category} />
                      ) : (
                        categoryLabel[purchase.category]
                      )}
                    </td>
                    <td>
                      {purchase.receipt_path && receiptLinks.get(purchase.receipt_path) ? (
                        <Link href={receiptLinks.get(purchase.receipt_path)!} target="_blank">
                          View receipt
                        </Link>
                      ) : purchase.receipt_not_needed ? (
                        'Not needed'
                      ) : purchase.receipt_path ? (
                        'Receipt unavailable'
                      ) : (
                        'Not required'
                      )}
                      </td>
                      <td>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</td>
                      {!isReadOnlyFinanceViewer ? (
                        <td>
                          <PurchaseEntryActions
                            purchaseId={purchase.id}
                            description={purchase.description}
                            amountCents={purchase.amount_cents}
                            purchasedAt={purchase.purchased_at}
                            personName={purchase.person_name}
                            paymentMethod={purchase.payment_method}
                            category={purchase.category}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="hq-pagination">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="hq-pagination-links">
                {page > 1 ? (
                  <Link href={`/dashboard/expenses?${buildQueryString(currentParamState, { page: '1' })}`}>First</Link>
                ) : null}
                {page > 1 ? (
                  <Link
                    href={`/dashboard/expenses?${buildQueryString(currentParamState, { page: String(page - 1) })}`}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={`/dashboard/expenses?${buildQueryString(currentParamState, { page: String(page + 1) })}`}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <p className="empty-note">No purchases matched the current filters.</p>
        )}
      </section>
    </div>
  );
}
