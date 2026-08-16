import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState, getCurrentAcademicYear, getReportingWindows, formatDateLabel, formatPacificDateKey } from '@/lib/academic-calendar';
import { updateLeadTeamDescriptionAction } from '@/app/dashboard/teams/actions';
import { getReceiptTaskState } from '@/lib/purchases';
import { formatQuarterReportTitle } from '@/lib/reports';
import { EOY_REPORT_TITLE, getEoyReportState } from '@/lib/eoy-report';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { getAllHighValueAssets, getHighValueAssetsForTeams, storageLocationLabel, LEADERSHIP_STEWARD_LABEL } from '@/lib/high-value-assets';
import { getPendingCardAgreements } from '@/lib/credit-card';
import { getSummerSpendSummary } from '@/lib/summer-spend';
import {
  CATEGORY_COLORS,
  PURCHASE_CATEGORIES,
  categoryTotals as computeCategoryTotals,
  chartDenominator,
  donutGradient,
  donutSlices,
  sumAmounts
} from '@/lib/finance-math';
import { SummerSpendPanel } from '@/components/summer-spend-panel';
import { LeadershipExpenseLogger } from '@/components/leadership-expense-logger';
import { TeamExpenseLogger } from '@/components/team-expense-logger';
import { HighValueAssetPanel } from '@/components/high-value-asset-panel';
import { type HighValueAssetView } from '@/components/high-value-asset-list';
import { VisitorLinkGenerator } from '@/components/visitor-link-generator';

type Team = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
};

type Membership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
};

type RosterMember = {
  id: string;
  team_id: string;
};

type PendingReceipt = {
  id: string;
  description: string;
  purchased_at: string;
  payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  receipt_path: string | null;
  receipt_not_needed: boolean;
};

type Announcement = {
  id: string;
  title: string;
  details: string | null;
  location: string;
  event_at: string;
  recipient_scope: 'all_teams' | 'specific_teams';
};

type AnnouncementRsvp = {
  announcement_id: string;
  response: 'yes' | 'maybe' | 'no';
};

const adminCards = [
  {
    href: '/dashboard/teams',
    title: 'Manage teams',
    description: 'Create teams, assign leads, and manage club structure.'
  },
  {
    href: '/dashboard/members',
    title: 'Manage members',
    description: 'Review admins and team leads across the club.'
  },
  {
    href: '/dashboard/finances',
    title: 'Manage finances',
    description: 'Set club and team budgets for the current academic cycle.'
  },
  {
    href: '/dashboard/reports',
    title: 'Team reports',
    description: 'Review current quarter submissions and past report history.'
  },
  {
    href: '/dashboard/tasks',
    title: 'Assign tasks',
    description: 'Send work items to one team, many teams, or the whole club.'
  },
  {
    href: '/dashboard/settings',
    title: 'Club settings',
    description: 'Review the current cycle and portal-wide controls.'
  }
];

const presidentCards = [
  {
    href: '/dashboard/teams',
    title: 'Teams',
    description: 'View teams, leads, and team structure across the club.'
  },
  {
    href: '/dashboard/members',
    title: 'Users',
    description: 'Review admins, presidents, leads, and recorded members.'
  },
  {
    href: '/dashboard/finances',
    title: 'Finances',
    description: 'View club and team budgets, allocations, and spend.'
  },
  {
    href: '/dashboard/reports',
    title: 'Team reports',
    description: 'Review current quarter submissions and past report history.'
  },
  {
    href: '/dashboard/tasks',
    title: 'Tasks',
    description: 'View currently assigned work across the club.'
  },
  {
    href: '/dashboard/expenses',
    title: 'Expense log',
    description: 'Inspect purchase history, receipts, and spending trends.'
  }
];

const financialOfficerCards = [
  {
    href: '/dashboard/finances',
    title: 'Finances',
    description: 'Review club and team budgets, allocations, and spend.'
  },
  {
    href: '/dashboard/purchases',
    title: 'Purchases',
    description: 'Review purchase history across teams in read-only mode.'
  },
  {
    href: '/dashboard/expenses',
    title: 'Expense log',
    description: 'Inspect spending, receipts, and category trends.'
  },
  {
    href: '/dashboard/receipts',
    title: 'Receipts',
    description: 'Review receipt submissions from the most recently completed month.'
  }
];

// Module scope so the clock reads stay out of the component body.
function currentPacificMonthKey() {
  return formatPacificDateKey(new Date()).slice(0, 7);
}

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function getQuarterVisual(quarter: string) {
  if (quarter.startsWith('Autumn')) {
    return { label: 'Fall', mark: '🍁', tone: 'autumn' as const };
  }

  if (quarter.startsWith('Winter')) {
    return { label: 'Winter', mark: '❄', tone: 'winter' as const };
  }

  if (quarter.startsWith('Spring')) {
    return { label: 'Spring', mark: '🌸', tone: 'spring' as const };
  }

  return { label: 'Summer', mark: '☀', tone: 'summer' as const };
}

export default async function DashboardPage() {
  const admin = createAdminClient();
  const { user, profile: me, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isPresident = currentRole === 'president';
  const isVicePresident = currentRole === 'vice_president';
  const isFinancialOfficer = currentRole === 'financial_officer';

  // Only Financial Officers and admins act on credit card access requests, so
  // only fetch the pending count for them.
  const showCardApprovalBanner = isAdmin || isFinancialOfficer;

  if (isAdmin || isPresident || isVicePresident || isFinancialOfficer) {
    const academicYear = await getCurrentAcademicYear();
    const [
      { data: teamsData },
      { data: membershipsData },
      { count },
      { data: rosterMembersData },
      allAssets,
      pendingCardAgreements,
      summerSpend,
      { data: teamBudgetsData },
      { data: clubBudgetData },
      { data: cyclePurchasesData },
      { data: reimbursementRowsData }
    ] = await Promise.all([
      admin
        .from('teams')
        .select('id, name, description, logo_url, is_active, created_at')
        .eq('is_active', true)
        .order('name'),
      admin
        .from('team_memberships')
        .select('id, team_id, user_id, team_role, is_active')
        .eq('is_active', true),
      admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('active', true),
      admin.from('team_roster_members').select('id'),
      getAllHighValueAssets(),
      showCardApprovalBanner ? getPendingCardAgreements() : Promise.resolve([]),
      getSummerSpendSummary(academicYear),
      admin.from('team_budgets').select('team_id, annual_budget_cents').eq('academic_year', academicYear),
      admin.from('club_budgets').select('total_budget_cents').eq('academic_year', academicYear).maybeSingle(),
      admin
        .from('purchase_logs')
        .select(
          'id, team_id, description, person_name, amount_cents, purchased_at, category, payment_method, receipt_path, receipt_not_needed'
        )
        .eq('expense_type', 'team')
        .eq('academic_year', academicYear),
      admin.from('member_reimbursements').select('id, team_id, status, finance_processed_at, amount_cents')
    ]);
    const pendingCardCount = pendingCardAgreements.length;
    const teams = (teamsData || []) as Team[];
    const memberships = (membershipsData || []) as Membership[];
    const activeLeadMemberships = memberships.filter((membership) => membership.team_role === 'lead');
    const totalMembers = (count || 0) + (rosterMembersData || []).length;

    const assetLoggerIds = Array.from(
      new Set(allAssets.map((asset) => asset.logged_by).filter((id): id is string => Boolean(id)))
    );
    const assetTeamIds = Array.from(
      new Set(allAssets.map((asset) => asset.team_id).filter((id): id is string => Boolean(id)))
    );
    const [{ data: assetTeamsData }, { data: assetLoggerProfilesData }] = await Promise.all([
      assetTeamIds.length > 0
        ? admin.from('teams').select('id, name').in('id', assetTeamIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      assetLoggerIds.length > 0
        ? admin.from('profiles').select('id, full_name').in('id', assetLoggerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] })
    ]);
    const assetTeamNames = new Map((assetTeamsData || []).map((team) => [team.id, team.name]));
    const assetLoggerNames = new Map((assetLoggerProfilesData || []).map((profile) => [profile.id, profile.full_name]));
    const allAssetViews: HighValueAssetView[] = allAssets.map((asset) => ({
      id: asset.id,
      teamName:
        asset.steward_scope === 'leadership'
          ? LEADERSHIP_STEWARD_LABEL
          : assetTeamNames.get(asset.team_id ?? '') || 'Unknown team',
      itemName: asset.item_name,
      amountCents: asset.amount_cents,
      locationLabel: storageLocationLabel(asset.storage_location, asset.storage_location_other),
      loggedByName: (asset.logged_by && assetLoggerNames.get(asset.logged_by)) || 'Unknown',
      createdAt: asset.created_at,
      stewardshipNote: asset.stewardship_note
    }));

    // Per-team finance rollup for the cycle.
    const usd = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    const teamBudgetById = new Map(
      ((teamBudgetsData || []) as Array<{ team_id: string; annual_budget_cents: number }>).map((row) => [
        row.team_id,
        row.annual_budget_cents
      ])
    );
    const cyclePurchases = (cyclePurchasesData || []) as Array<{
      id: string;
      team_id: string | null;
      description: string | null;
      person_name: string | null;
      amount_cents: number;
      purchased_at: string;
      category: 'equipment' | 'food' | 'travel' | 'registration' | null;
      payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown' | null;
      receipt_path: string | null;
      receipt_not_needed: boolean;
    }>;
    const teamNameById = new Map(teams.map((teamRow) => [teamRow.id, teamRow.name]));
    const monthKey = currentPacificMonthKey();
    const spentByTeam = new Map<string, number>();
    const monthByTeam = new Map<string, number>();
    for (const purchase of cyclePurchases) {
      if (!purchase.team_id) continue;
      spentByTeam.set(purchase.team_id, (spentByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
      if (formatPacificDateKey(new Date(purchase.purchased_at)).slice(0, 7) === monthKey) {
        monthByTeam.set(purchase.team_id, (monthByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
      }
    }
    const clubBudgetCents = clubBudgetData?.total_budget_cents || 0;
    const clubSpentCents = cyclePurchases.reduce((sum, purchase) => sum + purchase.amount_cents, 0);
    const teamFinanceRows = teams
      .map((teamRow) => {
        const budget = teamBudgetById.get(teamRow.id) || 0;
        const teamSpent = spentByTeam.get(teamRow.id) || 0;
        return {
          id: teamRow.id,
          name: teamRow.name,
          budgetCents: budget,
          spentCents: teamSpent,
          monthCents: monthByTeam.get(teamRow.id) || 0,
          remainingCents: budget - teamSpent
        };
      })
      .sort((a, b) => b.spentCents - a.spentCents);
    const overBudgetTeams = teamFinanceRows.filter((row) => row.budgetCents > 0 && row.remainingCents < 0);
    const summerOverTeams = summerSpend.teams.filter((row) => row.remainingCents < 0);

    const reimbursementRows = (reimbursementRowsData || []) as Array<{
      id: string;
      team_id: string;
      status: 'pending' | 'approved' | 'rejected';
      finance_processed_at: string | null;
      amount_cents: number;
    }>;
    const pendingReimbCount = reimbursementRows.filter((row) => row.status === 'pending').length;
    const toFile = reimbursementRows.filter((row) => row.status === 'approved' && !row.finance_processed_at);
    const toFileTotalCents = toFile.reduce((sum, row) => sum + row.amount_cents, 0);

    const missingReceipts = cyclePurchases
      .filter(
        (purchase) =>
          purchase.payment_method === 'credit_card' && !purchase.receipt_path && !purchase.receipt_not_needed
      )
      .map((purchase) => ({
        purchase,
        state: getReceiptTaskState({
          paymentMethod: purchase.payment_method || 'unknown',
          purchasedAt: purchase.purchased_at,
          receiptPath: purchase.receipt_path,
          receiptNotNeeded: purchase.receipt_not_needed
        })
      }));
    const overdueReceiptCount = missingReceipts.filter((entry) => entry.state.overdue).length;

    const sortedByDate = [...cyclePurchases].sort(
      (a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at)
    );
    const BIG_TICKET_CENTS = 25000;
    const bigTickets = sortedByDate.filter((purchase) => purchase.amount_cents >= BIG_TICKET_CENTS).slice(0, 8);
    const recentPurchases = sortedByDate.slice(0, 10);

    const roleLabel = isAdmin
      ? 'Admin portal'
      : isPresident
        ? 'President portal'
        : isVicePresident
          ? 'Vice president portal'
          : 'Financial officer portal';
    const firstName = (me.full_name || '').split(' ')[0] || 'officer';
    const navCards = isAdmin ? adminCards : isPresident || isVicePresident ? presidentCards : financialOfficerCards;
    const attentionCount =
      pendingCardCount + toFile.length + (overdueReceiptCount > 0 ? 1 : 0) + overBudgetTeams.length + summerOverTeams.length;

    return (
      <div className="th-page">
        {/* Masthead */}
        <header className="th-mast">
          <div className="th-mast-main">
            <p className="th-mast-eyebrow">{roleLabel} · {academicYear}</p>
            <div className="th-mast-title">
              <h1>Robotics HQ</h1>
            </div>
            <p className="th-mast-desc">
              Welcome back, {firstName}. {teams.length} active team{teams.length === 1 ? '' : 's'} ·{' '}
              {totalMembers} members · {activeLeadMemberships.length} lead assignments.
            </p>
          </div>
          <div className="th-mast-side">
            <Link href="/dashboard/finances" className="th-btn-light">
              Finances
            </Link>
            <Link href="/dashboard/reimbursements" className="th-mast-link">
              Reimbursements →
            </Link>
          </div>
        </header>

        {/* Scoreboard */}
        <div className="th-stats">
          <Link href="/dashboard/finances" className="th-stat">
            <span>Club budget</span>
            <strong>{usd(clubBudgetCents)}</strong>
          </Link>
          <Link href="/dashboard/expenses" className="th-stat">
            <span>Spent · {academicYear}</span>
            <strong>{usd(clubSpentCents)}</strong>
          </Link>
          <Link href="/dashboard/finances" className="th-stat">
            <span>Remaining</span>
            <strong className={clubBudgetCents - clubSpentCents < 0 ? 'th-bad' : undefined}>
              {usd(clubBudgetCents - clubSpentCents)}
            </strong>
          </Link>
          <Link href={isFinancialOfficer ? '/dashboard/finances' : '/dashboard/teams'} className="th-stat">
            <span>Teams</span>
            <strong>{teams.length}</strong>
          </Link>
          <Link href={isFinancialOfficer ? '/dashboard/expenses' : '/dashboard/members'} className="th-stat">
            <span>Members</span>
            <strong>{totalMembers}</strong>
          </Link>
          <Link href="/dashboard/reimbursements" className="th-stat">
            <span>Pending reimb.</span>
            <strong className={pendingReimbCount > 0 ? 'th-warn' : undefined}>{pendingReimbCount}</strong>
          </Link>
          <Link href="/dashboard/reimbursements" className="th-stat">
            <span>To file in Granted</span>
            <strong className={toFile.length > 0 ? 'th-warn' : undefined}>{toFile.length}</strong>
          </Link>
          {showCardApprovalBanner ? (
            <Link href="/dashboard/credit-card/approvals" className="th-stat">
              <span>Card approvals</span>
              <strong className={pendingCardCount > 0 ? 'th-warn' : undefined}>{pendingCardCount}</strong>
            </Link>
          ) : null}
          <Link href="/dashboard/expenses" className="th-stat">
            <span>Receipts missing</span>
            <strong className={overdueReceiptCount > 0 ? 'th-bad' : missingReceipts.length > 0 ? 'th-warn' : undefined}>
              {missingReceipts.length}
            </strong>
          </Link>
        </div>

        {/* Needs attention */}
        {attentionCount > 0 ? (
          <details className="th-section th-section-alert" open>
            <summary>
              <span className="th-sec-label">Needs attention</span>
              <span className="th-sec-preview">
                {[
                  pendingCardCount > 0 ? `${pendingCardCount} card request${pendingCardCount === 1 ? '' : 's'}` : null,
                  toFile.length > 0 ? `${toFile.length} to file in Granted (${usd(toFileTotalCents)})` : null,
                  overdueReceiptCount > 0 ? `${overdueReceiptCount} receipts overdue` : null,
                  overBudgetTeams.length > 0
                    ? `${overBudgetTeams.length} team${overBudgetTeams.length === 1 ? '' : 's'} over budget`
                    : null,
                  summerOverTeams.length > 0
                    ? `${summerOverTeams.length} over summer plan`
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="th-sec-count">{attentionCount}</span>
            </summary>
            <div className="th-body">
              <div className="table-wrap">
                <table>
                  <tbody>
                    {showCardApprovalBanner && pendingCardCount > 0 ? (
                      <tr>
                        <td className="th-warn" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Card access
                        </td>
                        <td>
                          {pendingCardCount} signed agreement{pendingCardCount === 1 ? '' : 's'} awaiting review
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href="/dashboard/credit-card/approvals" className="th-link">
                            Review →
                          </Link>
                        </td>
                      </tr>
                    ) : null}
                    {toFile.length > 0 ? (
                      <tr>
                        <td className="th-warn" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          File in Granted
                        </td>
                        <td>
                          {toFile.length} approved reimbursement{toFile.length === 1 ? '' : 's'} totaling{' '}
                          {usd(toFileTotalCents)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href="/dashboard/reimbursements" className="th-link">
                            Open →
                          </Link>
                        </td>
                      </tr>
                    ) : null}
                    {overdueReceiptCount > 0 ? (
                      <tr>
                        <td className="th-bad" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Receipts overdue
                        </td>
                        <td>
                          {overdueReceiptCount} of {missingReceipts.length} missing receipts past the deadline
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href="/dashboard/expenses" className="th-link">
                            Open →
                          </Link>
                        </td>
                      </tr>
                    ) : null}
                    {overBudgetTeams.map((row) => (
                      <tr key={`over-${row.id}`}>
                        <td className="th-bad" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Over budget
                        </td>
                        <td>
                          {row.name} — spent {usd(row.spentCents)} of {usd(row.budgetCents)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/dashboard/teams/${row.id}`} className="th-link">
                            Team page →
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {summerOverTeams.map((row) => (
                      <tr key={`summer-${row.teamId}`}>
                        <td className="th-bad" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          Summer overspend
                        </td>
                        <td>
                          {row.teamName} — {usd(Math.abs(row.remainingCents))} over their planned summer spend
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Link href={`/dashboard/teams/${row.teamId}`} className="th-link">
                            Team page →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ) : null}

        {/* Per-team spend */}
        <details className="th-section" open>
          <summary>
            <span className="th-sec-label">Team spending</span>
            <span className="th-sec-preview">
              {usd(clubSpentCents)} spent across {teams.length} teams · {usd(clubBudgetCents)} club budget
            </span>
            <span className="th-sec-count">{teams.length}</span>
          </summary>
          <div className="th-body">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Budget</th>
                    <th>Spent</th>
                    <th>This month</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {teamFinanceRows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 700 }}>
                        <Link href={`/dashboard/teams/${row.id}`} className="th-link">
                          {row.name}
                        </Link>
                      </td>
                      <td>{usd(row.budgetCents)}</td>
                      <td>{usd(row.spentCents)}</td>
                      <td>{usd(row.monthCents)}</td>
                      <td className={row.remainingCents < 0 ? 'th-bad' : undefined} style={{ fontWeight: 700 }}>
                        {usd(row.remainingCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        {/* Big-ticket purchases */}
        <details className="th-section">
          <summary>
            <span className="th-sec-label">Big-ticket items</span>
            <span className="th-sec-preview">
              {bigTickets.length > 0
                ? `Latest: ${bigTickets[0].description || 'Untitled'} (${usd(bigTickets[0].amount_cents)}, ${teamNameById.get(bigTickets[0].team_id || '') || 'Unknown team'})`
                : 'No purchases of $250 or more this cycle'}
            </span>
            <span className="th-sec-count">{bigTickets.length}</span>
          </summary>
          <div className="th-body">
            {bigTickets.length === 0 ? (
              <p className="empty-note">No purchases of $250 or more this cycle.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Team</th>
                      <th>Item</th>
                      <th>Person</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bigTickets.map((purchase) => (
                      <tr key={purchase.id}>
                        <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                        <td>{teamNameById.get(purchase.team_id || '') || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{purchase.description || 'Untitled purchase'}</td>
                        <td>{purchase.person_name || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{usd(purchase.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        {/* Recent purchases */}
        <details className="th-section">
          <summary>
            <span className="th-sec-label">Recent purchases</span>
            <span className="th-sec-preview">
              {recentPurchases[0]
                ? `Latest: ${recentPurchases[0].description || 'Untitled'} (${usd(recentPurchases[0].amount_cents)})`
                : 'Nothing logged this cycle yet'}
            </span>
            <span className="th-sec-count">{cyclePurchases.length}</span>
          </summary>
          <div className="th-body">
            <div className="th-block-head">
              <h3>Last 10 purchases</h3>
              <Link href="/dashboard/expenses" className="th-link">
                Full expense log →
              </Link>
            </div>
            {recentPurchases.length === 0 ? (
              <p className="empty-note">No purchases logged this cycle yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Team</th>
                      <th>Item</th>
                      <th>Person</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPurchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                        <td>{teamNameById.get(purchase.team_id || '') || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{purchase.description || 'Untitled purchase'}</td>
                        <td>{purchase.person_name || '—'}</td>
                        <td>{usd(purchase.amount_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        {/* Summer spending */}
        {summerSpend.teams.length > 0 ? (
          <details className="th-section">
            <summary>
              <span className="th-sec-label">Summer spending</span>
              <span className="th-sec-preview">
                {usd(summerSpend.totalRemainingCents)} remaining of {usd(summerSpend.totalPlannedCents)} planned
              </span>
              <span className="th-sec-count">{summerSpend.teams.length}</span>
            </summary>
            <div className="th-body">
              <SummerSpendPanel summary={summerSpend} />
            </div>
          </details>
        ) : null}

        {/* Log expenses */}
        {isAdmin || isPresident || isVicePresident || isFinancialOfficer ? (
          <details className="th-section">
            <summary>
              <span className="th-sec-label">Log an expense</span>
              <span className="th-sec-preview">
                {isFinancialOfficer
                  ? 'Record a team purchase'
                  : isPresident
                    ? 'Record a leadership or team purchase'
                    : 'Record a leadership purchase'}
              </span>
              <span className="th-sec-count">{''}</span>
            </summary>
            <div className="th-body">
              {isAdmin || isPresident || isVicePresident ? (
                <LeadershipExpenseLogger academicYear={academicYear} personName={me.full_name || ''} />
              ) : null}
              {isPresident || isFinancialOfficer ? (
                <TeamExpenseLogger
                  teams={teams.map((teamRow) => ({ id: teamRow.id, name: teamRow.name }))}
                  academicYear={academicYear}
                  personName={me.full_name || ''}
                />
              ) : null}
            </div>
          </details>
        ) : null}

        {/* Visitors */}
        {isAdmin || isPresident || isVicePresident ? (
          <details className="th-section">
            <summary>
              <span className="th-sec-label">Visitors</span>
              <span className="th-sec-preview">Generate a visitor agreement link</span>
              <span className="th-sec-count">{''}</span>
            </summary>
            <div className="th-body">
              <VisitorLinkGenerator />
            </div>
          </details>
        ) : null}

        {/* Equipment */}
        <details className="th-section">
          <summary>
            <span className="th-sec-label">Equipment</span>
            <span className="th-sec-preview">
              {allAssetViews.length > 0
                ? `${allAssetViews.length} high value item${allAssetViews.length === 1 ? '' : 's'} on record`
                : 'No high value equipment recorded'}
            </span>
            <span className="th-sec-count">{allAssetViews.length}</span>
          </summary>
          <div className="th-body">
            <HighValueAssetPanel
              teams={teams.map((teamRow) => ({ id: teamRow.id, name: teamRow.name }))}
              canStewardLeadership={isAdmin || isPresident || isVicePresident}
              loggedByName={me.full_name || ''}
              initialAssets={allAssetViews}
              showTeam
              canManage={isAdmin}
              canLog={isAdmin || isPresident || isVicePresident}
              listTitle="High value equipment"
            />
          </div>
        </details>

        {/* Navigate */}
        <details className="th-section">
          <summary>
            <span className="th-sec-label">Navigate</span>
            <span className="th-sec-preview">Every destination in your portal</span>
            <span className="th-sec-count">{navCards.length}</span>
          </summary>
          <div className="th-body">
            <div className="table-wrap">
              <table>
                <tbody>
                  {navCards.map((card) => (
                    <tr key={card.href}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Link href={card.href} className="th-link">
                          {card.title} →
                        </Link>
                      </td>
                      <td>{card.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </div>
    );
  }

  const myTeamIds = await getLeadTeamIds(user.id);
  const primaryTeamId = myTeamIds[0];

  if (!primaryTeamId) {
    return (
      <div className="hq-page th-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Lead portal</p>
            <h1 className="hq-page-title">Dashboard</h1>
            <p className="hq-subtitle">You do not have an active team assignment yet.</p>
          </div>
        </section>
      </div>
    );
  }

  const [{ data: team }, { data: teamMembershipsData }, { data: rosterMembersData }, reportState, cycle] = await Promise.all([
    admin
      .from('teams')
      .select('id, name, description, logo_url, is_active, created_at')
      .eq('id', primaryTeamId)
      .single<Team>(),
    admin
      .from('team_memberships')
      .select('id, team_id, user_id, team_role, is_active')
      .eq('team_id', primaryTeamId)
      .eq('is_active', true),
    admin
      .from('team_roster_members')
      .select('id, team_id')
      .eq('team_id', primaryTeamId),
    getNextReportState(),
    getCurrentAcademicYear()
  ]);

  if (!team) {
    redirect('/login');
  }

  const teamMemberships = (teamMembershipsData || []) as Membership[];
  const rosterMembers = (rosterMembersData || []) as RosterMember[];
  const memberCount = teamMemberships.length + rosterMembers.length;
  const [
    { data: teamBudget },
    { data: purchasesData },
    { data: pendingReceiptsData },
    { data: tasksData },
    { data: taskRecipients },
    { data: taskCompletions },
    { data: announcementsData },
    { data: announcementRecipientsData },
    { data: announcementRsvpsData },
    reportingWindows
  ] =
    await Promise.all([
      admin
        .from('team_budgets')
        .select('annual_budget_cents')
        .eq('team_id', team.id)
        .eq('academic_year', cycle)
        .maybeSingle(),
      admin
        .from('purchase_logs')
        .select('id, description, person_name, amount_cents, purchased_at, category')
        .eq('team_id', team.id)
        .eq('academic_year', cycle),
      admin
        .from('purchase_logs')
        .select('id, description, purchased_at, payment_method, receipt_path, receipt_not_needed')
        .eq('team_id', team.id)
        .eq('payment_method', 'credit_card')
        .eq('receipt_not_needed', false)
        .is('receipt_path', null)
        .order('purchased_at', { ascending: true }),
      admin
        .from('tasks')
        .select('id, title, recipient_scope')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      admin.from('task_recipients').select('task_id, team_id').eq('team_id', team.id),
      admin.from('task_completions').select('task_id').eq('team_id', team.id),
      admin
        .from('announcements')
        .select('id, title, details, location, event_at, recipient_scope')
        .eq('is_active', true)
        .gte('event_at', hoursAgoIso(12))
        .order('event_at', { ascending: true }),
      admin.from('announcement_recipients').select('announcement_id, team_id').eq('team_id', team.id),
      admin.from('announcement_recipient_rsvps').select('announcement_id, response'),
      getReportingWindows(cycle)
    ]);
  const { data: pendingReimbursementsData } = await admin
    .from('member_reimbursements')
    .select('id, submitter_name, item_name, amount_cents, reimbursement_number, requires_signature, created_at')
    .eq('team_id', team.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  const pendingReimbursements = (pendingReimbursementsData || []) as Array<{
    id: string;
    submitter_name: string;
    item_name: string;
    amount_cents: number;
    reimbursement_number: string;
    requires_signature: boolean;
    created_at: string;
  }>;
  const recipientTaskIds = new Set((taskRecipients || []).map((entry) => entry.task_id));
  const completedTaskIds = new Set((taskCompletions || []).map((entry) => entry.task_id));
  const recipientAnnouncementIds = new Set((announcementRecipientsData || []).map((entry) => entry.announcement_id));
  const teamTasks = (tasksData || []).filter(
    (task) => !completedTaskIds.has(task.id) && (task.recipient_scope === 'all_teams' || recipientTaskIds.has(task.id))
  );
  const teamAnnouncements = ((announcementsData || []) as Announcement[]).filter(
    (announcement) => announcement.recipient_scope === 'all_teams' || recipientAnnouncementIds.has(announcement.id)
  );
  const announcementRsvps = (announcementRsvpsData || []) as AnnouncementRsvp[];
  const announcementRsvpStats = new Map<
    string,
    {
      yes: number;
      maybe: number;
      no: number;
    }
  >();
  for (const rsvp of announcementRsvps) {
    const stats = announcementRsvpStats.get(rsvp.announcement_id) || { yes: 0, maybe: 0, no: 0 };
    if (rsvp.response === 'yes') stats.yes += 1;
    if (rsvp.response === 'maybe') stats.maybe += 1;
    if (rsvp.response === 'no') stats.no += 1;
    announcementRsvpStats.set(rsvp.announcement_id, stats);
  }
  const annualBudget = teamBudget?.annual_budget_cents ? teamBudget.annual_budget_cents / 100 : 0;
  const purchases = (purchasesData || []) as Array<{
    id: string;
    description: string | null;
    person_name: string | null;
    amount_cents: number;
    purchased_at: string;
    category: 'equipment' | 'food' | 'travel' | 'registration' | null;
  }>;
  const spent = purchases.reduce(
    (sum, purchase) => sum + purchase.amount_cents / 100,
    0
  );
  const quarterlySpend = reportingWindows.map((window) => {
    const startKey = formatPacificDateKey(window.start);
    const endKey = formatPacificDateKey(window.end);
    const totalCents = purchases.reduce((sum, purchase) => {
      const purchaseKey = formatPacificDateKey(new Date(purchase.purchased_at));
      if (purchaseKey < startKey || purchaseKey > endKey) {
        return sum;
      }

      return sum + purchase.amount_cents;
    }, 0);

    return {
      quarter: window.quarter,
      total: totalCents / 100
    };
  });
  // Category breakdown for the cycle: how much budget went to equipment, food,
  // travel, and registration. The donut is shares of the annual budget with the
  // unused remainder in grey; when spend exceeds budget (or none is set), it
  // falls back to shares of total spend.
  const CATEGORY_LABELS: Record<(typeof PURCHASE_CATEGORIES)[number], string> = {
    equipment: 'Equipment',
    food: 'Food',
    travel: 'Travel',
    registration: 'Registration'
  };
  const budgetCents = teamBudget?.annual_budget_cents || 0;
  const spentCents = sumAmounts(purchases);
  const totalsByCategory = computeCategoryTotals(purchases);
  const categoryTotals = PURCHASE_CATEGORIES.map((key) => ({
    key,
    label: CATEGORY_LABELS[key],
    color: CATEGORY_COLORS[key],
    cents: totalsByCategory[key]
  }));
  const donutDenominator = chartDenominator(budgetCents, spentCents);
  const donutBackground = donutGradient(donutSlices(totalsByCategory, donutDenominator));

  const pendingReceipts = (pendingReceiptsData || []) as PendingReceipt[];
  const spentPercent = annualBudget > 0 ? Math.min(100, Math.round((spent / annualBudget) * 100)) : 0;

  // These queries only depend on values already known here (team.id, myTeamIds,
  // reportState), so fold them into a single round-trip block instead of
  // awaiting each sequentially.
  const [{ data: reportRecord }, eoyState, { data: myTeamsData }, leadAssets] = await Promise.all([
    admin
      .from('team_reports')
      .select('id, status')
      .eq('team_id', team.id)
      .eq('academic_year', reportState.academicYear)
      .eq('quarter', reportState.targetQuarter)
      .maybeSingle(),
    getEoyReportState(),
    admin.from('teams').select('id, name').in('id', myTeamIds),
    getHighValueAssetsForTeams(myTeamIds)
  ]);

  // eoyRecord depends on eoyState (resolved above); the lead asset logger
  // profiles depend on leadAssets (resolved above). Both inputs are now known,
  // so run these two together.
  const leadAssetLoggerIds = Array.from(
    new Set(leadAssets.map((asset) => asset.logged_by).filter((id): id is string => Boolean(id)))
  );
  const [{ data: eoyRecord }, { data: leadAssetLoggerProfilesData }] = await Promise.all([
    admin
      .from('eoy_reports')
      .select('id, status')
      .eq('team_id', team.id)
      .eq('academic_year', eoyState.academicYear)
      .maybeSingle(),
    leadAssetLoggerIds.length > 0
      ? admin.from('profiles').select('id, full_name').in('id', leadAssetLoggerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] })
  ]);
  const showEoyCard = eoyState.reportState !== 'closed' || eoyRecord?.status === 'submitted';

  const myTeams = ((myTeamsData || []) as { id: string; name: string }[]).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const leadAssetTeamNames = new Map(myTeams.map((teamRecord) => [teamRecord.id, teamRecord.name]));
  const leadAssetLoggerNames = new Map(
    (leadAssetLoggerProfilesData || []).map((profileRecord) => [profileRecord.id, profileRecord.full_name])
  );
  const leadAssetViews: HighValueAssetView[] = leadAssets.map((asset) => ({
    id: asset.id,
    teamName: (asset.team_id ? leadAssetTeamNames.get(asset.team_id) : null) || team.name,
    itemName: asset.item_name,
    amountCents: asset.amount_cents,
    locationLabel: storageLocationLabel(asset.storage_location, asset.storage_location_other),
    loggedByName: (asset.logged_by && leadAssetLoggerNames.get(asset.logged_by)) || 'Unknown',
    createdAt: asset.created_at,
    stewardshipNote: asset.stewardship_note
  }));

  const firstName = (me.full_name || '').split(' ')[0] || 'lead';
  const receiptStates = pendingReceipts.map((purchase) => ({
    purchase,
    state: getReceiptTaskState({
      paymentMethod: purchase.payment_method,
      purchasedAt: purchase.purchased_at,
      receiptPath: purchase.receipt_path,
      receiptNotNeeded: purchase.receipt_not_needed
    })
  }));
  const overdueReceiptCount = receiptStates.filter((entry) => entry.state.overdue).length;
  const reportDue = reportState.reportState === 'open' && reportRecord?.status !== 'submitted';
  const eoyDue = eoyState.reportState === 'open' && eoyRecord?.status !== 'submitted';
  const attentionCount =
    pendingReimbursements.length + pendingReceipts.length + (reportDue ? 1 : 0) + (eoyDue ? 1 : 0);
  const recentPurchases = [...purchases]
    .sort((a, b) => Date.parse(b.purchased_at) - Date.parse(a.purchased_at))
    .slice(0, 8);
  const nextEvent = teamAnnouncements[0] || null;
  const usd = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="th-page">
      {/* Masthead */}
      <header className="th-mast">
        <div className="th-mast-main">
          <p className="th-mast-eyebrow">Lead portal · {cycle}</p>
          <div className="th-mast-title">
            {team.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo_url} alt="" className="th-mast-logo" />
            ) : (
              <span className="th-mast-logo th-mast-logo-fallback">{team.name.slice(0, 1)}</span>
            )}
            <h1>{team.name}</h1>
          </div>
          <p className="th-mast-desc">
            Welcome back, {firstName}. {memberCount} member{memberCount === 1 ? '' : 's'} ·{' '}
            {team.is_active ? 'active' : 'inactive'}.
          </p>
        </div>
        <div className="th-mast-side">
          <Link href="/dashboard/purchases" className="th-btn-light">
            Log purchase
          </Link>
          <Link href={`/dashboard/teams/${team.id}`} className="th-mast-link">
            Team page →
          </Link>
        </div>
      </header>

      {/* Scoreboard */}
      <div className="th-stats">
        <Link href={`/dashboard/teams/${team.id}`} className="th-stat">
          <span>Annual budget</span>
          <strong>{usd(annualBudget)}</strong>
        </Link>
        <Link href="/dashboard/purchases" className="th-stat">
          <span>Spent</span>
          <strong>{usd(spent)}</strong>
        </Link>
        <Link href={`/dashboard/teams/${team.id}`} className="th-stat">
          <span>Remaining</span>
          <strong className={annualBudget - spent < 0 ? 'th-bad' : undefined}>{usd(annualBudget - spent)}</strong>
        </Link>
        <Link href={`/dashboard/teams/${team.id}`} className="th-stat">
          <span>Utilization</span>
          <strong>{spentPercent}%</strong>
          <div className="th-stat-bar">
            <div style={{ width: `${spentPercent}%` }} />
          </div>
        </Link>
        <Link href="/dashboard/reimbursements" className="th-stat">
          <span>Pending reimb.</span>
          <strong className={pendingReimbursements.length > 0 ? 'th-warn' : undefined}>
            {pendingReimbursements.length}
          </strong>
        </Link>
        <Link href="/dashboard/purchases" className="th-stat">
          <span>Receipts owed</span>
          <strong className={overdueReceiptCount > 0 ? 'th-bad' : pendingReceipts.length > 0 ? 'th-warn' : undefined}>
            {pendingReceipts.length}
          </strong>
        </Link>
        <Link href="/dashboard/members" className="th-stat">
          <span>Members</span>
          <strong>{memberCount}</strong>
        </Link>
        <Link href="/dashboard/reports" className="th-stat th-stat-text">
          <span>Next report</span>
          <strong className={reportDue ? 'th-bad' : undefined}>
            {reportRecord?.status === 'submitted'
              ? 'Submitted'
              : reportState.reportState === 'open'
                ? `${reportState.countdownLabel} left`
                : `Opens in ${reportState.countdownLabel}`}
          </strong>
        </Link>
      </div>

      {/* Needs attention */}
      {attentionCount > 0 ? (
        <details className="th-section th-section-alert" open>
          <summary>
            <span className="th-sec-label">Needs attention</span>
            <span className="th-sec-preview">
              {[
                reportDue ? `${formatQuarterReportTitle(reportState.targetQuarter)} due` : null,
                eoyDue ? 'year-end report due' : null,
                pendingReimbursements.length > 0
                  ? `${pendingReimbursements.length} reimbursement${pendingReimbursements.length === 1 ? '' : 's'} to decide`
                  : null,
                pendingReceipts.length > 0
                  ? `${pendingReceipts.length} receipt${pendingReceipts.length === 1 ? '' : 's'} owed${overdueReceiptCount > 0 ? ` (${overdueReceiptCount} overdue)` : ''}`
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="th-sec-count">{attentionCount}</span>
          </summary>
          <div className="th-body">
            <div className="table-wrap">
              <table>
                <tbody>
                  {reportDue ? (
                    <tr>
                      <td className="th-bad" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Report due
                      </td>
                      <td>
                        {formatQuarterReportTitle(reportState.targetQuarter)} — {reportState.countdownLabel} remaining
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href="/dashboard/reports" className="th-link">
                          Open report →
                        </Link>
                      </td>
                    </tr>
                  ) : null}
                  {eoyDue ? (
                    <tr>
                      <td className="th-bad" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Year-end due
                      </td>
                      <td>
                        {EOY_REPORT_TITLE} — {eoyState.countdownLabel} remaining
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href="/dashboard/reports/eoy" className="th-link">
                          Open report →
                        </Link>
                      </td>
                    </tr>
                  ) : null}
                  {pendingReimbursements.map((reimbursement) => (
                    <tr key={reimbursement.id}>
                      <td className="th-warn" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        Reimbursement
                      </td>
                      <td>
                        {reimbursement.submitter_name} — {reimbursement.item_name} (
                        {usd(reimbursement.amount_cents / 100)}, {reimbursement.reimbursement_number})
                        {reimbursement.requires_signature ? ' · needs signature' : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href="/dashboard/reimbursements" className="th-link">
                          Decide →
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {receiptStates.map(({ purchase, state }) => (
                    <tr key={purchase.id}>
                      <td
                        className={state.overdue ? 'th-bad' : 'th-warn'}
                        style={{ fontWeight: 700, whiteSpace: 'nowrap' }}
                      >
                        {state.overdue ? 'Receipt overdue' : 'Receipt owed'}
                      </td>
                      <td>
                        {purchase.description || 'Untitled purchase'} —{' '}
                        {formatDateLabel(new Date(purchase.purchased_at))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link href="/dashboard/purchases" className="th-link">
                          Upload →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ) : null}

      {/* Spending */}
      <details className="th-section" open>
        <summary>
          <span className="th-sec-label">Spending</span>
          <span className="th-sec-preview">
            {usd(spent)} of {usd(annualBudget)} this cycle
            {recentPurchases[0]
              ? ` · latest: ${recentPurchases[0].description || 'Untitled'} (${usd(recentPurchases[0].amount_cents / 100)})`
              : ''}
          </span>
          <span className="th-sec-count">{purchases.length}</span>
        </summary>
        <div className="th-body">
          <div className="th-spend-viz">
            <div className="th-donut-wrap">
              <div className="th-donut" style={{ background: donutBackground }}>
                <div className="th-donut-inner">
                  <strong>{spentPercent}%</strong>
                  <span>used</span>
                </div>
              </div>
            </div>
            <div className="th-catbars">
              {categoryTotals.map((entry) => {
                const percentOfBudget =
                  donutDenominator > 0 ? Math.round((entry.cents / donutDenominator) * 100) : 0;
                return (
                  <div key={entry.key} className="th-catbar">
                    <div className="th-catbar-line">
                      <span className="th-catbar-label">
                        <i style={{ background: entry.color }} aria-hidden="true" />
                        {entry.label}
                      </span>
                      <strong>
                        {usd(entry.cents / 100)}
                        <em> · {percentOfBudget}% of {budgetCents > 0 && spentCents <= budgetCents ? 'budget' : 'spend'}</em>
                      </strong>
                    </div>
                    <div className="th-catbar-track">
                      <div style={{ width: `${Math.min(100, percentOfBudget)}%`, background: entry.color }} />
                    </div>
                  </div>
                );
              })}
              <div className="th-catbar">
                <div className="th-catbar-line">
                  <span className="th-catbar-label">
                    <i style={{ background: '#e8e1de' }} aria-hidden="true" />
                    Unspent
                  </span>
                  <strong>{usd(Math.max(0, budgetCents - spentCents) / 100)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="th-minigrid">
            {quarterlySpend.map((entry) => {
              const visual = getQuarterVisual(entry.quarter);
              return (
                <div key={entry.quarter} className="th-stat">
                  <span>
                    {visual.label} {visual.mark}
                  </span>
                  <strong>{usd(entry.total)}</strong>
                </div>
              );
            })}
          </div>

          <div className="th-block">
            <div className="th-block-head">
              <h3>Recent purchases</h3>
              <Link href={`/dashboard/teams/${team.id}`} className="th-link">
                Full ledger →
              </Link>
            </div>
            {recentPurchases.length === 0 ? (
              <p className="empty-note">No purchases logged this cycle yet.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item</th>
                      <th>Person</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPurchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td>{formatDateLabel(new Date(purchase.purchased_at))}</td>
                        <td style={{ fontWeight: 700 }}>{purchase.description || 'Untitled purchase'}</td>
                        <td>{purchase.person_name || '—'}</td>
                        <td>{usd(purchase.amount_cents / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* Events */}
      {teamAnnouncements.length > 0 ? (
        <details className="th-section">
          <summary>
            <span className="th-sec-label">Events</span>
            <span className="th-sec-preview">
              {nextEvent
                ? `Next: ${nextEvent.title} · ${new Date(nextEvent.event_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}`
                : ''}
            </span>
            <span className="th-sec-count">{teamAnnouncements.length}</span>
          </summary>
          <div className="th-body">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Event</th>
                    <th>Location</th>
                    <th>RSVPs</th>
                  </tr>
                </thead>
                <tbody>
                  {teamAnnouncements.map((announcement) => {
                    const stats = announcementRsvpStats.get(announcement.id) || { yes: 0, maybe: 0, no: 0 };
                    return (
                      <tr key={announcement.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(announcement.event_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'America/Los_Angeles'
                          })}
                        </td>
                        <td style={{ fontWeight: 700 }}>
                          {announcement.title}
                          {announcement.details ? (
                            <span className="hq-inline-note" style={{ display: 'block', fontWeight: 400 }}>
                              {announcement.details}
                            </span>
                          ) : null}
                        </td>
                        <td>{announcement.location}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {stats.yes} yes · {stats.maybe} maybe · {stats.no} no
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ) : null}

      {/* Tasks */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Tasks</span>
          <span className="th-sec-preview">
            {teamTasks.length > 0 ? `${teamTasks[0].title}${teamTasks.length > 1 ? ` · +${teamTasks.length - 1} more` : ''}` : 'No open tasks'}
          </span>
          <span className="th-sec-count">{teamTasks.length}</span>
        </summary>
        <div className="th-body">
          <div className="th-block-head">
            <h3>Open tasks</h3>
            <Link href="/dashboard/tasks" className="th-link">
              Open tasks →
            </Link>
          </div>
          {teamTasks.length === 0 ? (
            <p className="empty-note">No tasks assigned right now.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <tbody>
                  {teamTasks.map((task) => (
                    <tr key={task.id}>
                      <td style={{ fontWeight: 700 }}>{task.title}</td>
                      <td style={{ textAlign: 'right' }}>
                        {task.recipient_scope === 'all_teams' ? 'All teams' : team.name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      {/* Reports */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Reports</span>
          <span className="th-sec-preview">
            {formatQuarterReportTitle(reportState.targetQuarter)}:{' '}
            {reportRecord?.status === 'submitted'
              ? 'submitted'
              : reportState.reportState === 'open'
                ? `due in ${reportState.countdownLabel}`
                : `opens in ${reportState.countdownLabel}`}
            {showEoyCard
              ? ` · Year-end: ${eoyRecord?.status === 'submitted' ? 'submitted' : eoyState.reportState === 'open' ? `due in ${eoyState.countdownLabel}` : `opens in ${eoyState.countdownLabel}`}`
              : ''}
          </span>
          <span className="th-sec-count">{showEoyCard ? 2 : 1}</span>
        </summary>
        <div className="th-body">
          <div className="th-cols">
            <div className="th-block">
              <div className="th-block-head">
                <h3>{formatQuarterReportTitle(reportState.targetQuarter)}</h3>
                <Link href="/dashboard/reports" className="th-link">
                  Open →
                </Link>
              </div>
              <p className="helper">{reportState.message}</p>
              <p className="helper">
                {reportRecord?.status === 'submitted'
                  ? 'Submitted for this quarter.'
                  : reportState.reportState === 'open'
                    ? `Deadline in ${reportState.countdownLabel}.`
                    : `${reportState.countdownLabel} until reporting opens.`}
              </p>
            </div>
            {showEoyCard ? (
              <div className="th-block">
                <div className="th-block-head">
                  <h3>{EOY_REPORT_TITLE}</h3>
                  <Link href="/dashboard/reports/eoy" className="th-link">
                    Open →
                  </Link>
                </div>
                <p className="helper">{eoyState.message}</p>
                <p className="helper">
                  {eoyRecord?.status === 'submitted'
                    ? `Submitted for ${eoyState.academicYear}.`
                    : eoyState.reportState === 'open'
                      ? `Deadline in ${eoyState.countdownLabel}.`
                      : `${eoyState.countdownLabel} until reporting opens.`}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </details>

      {/* Equipment */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Equipment</span>
          <span className="th-sec-preview">
            {leadAssetViews.length > 0
              ? `${leadAssetViews.length} high value item${leadAssetViews.length === 1 ? '' : 's'} on record`
              : 'No high value equipment recorded'}
          </span>
          <span className="th-sec-count">{leadAssetViews.length}</span>
        </summary>
        <div className="th-body">
          <HighValueAssetPanel
            teams={myTeams}
            loggedByName={me.full_name || ''}
            initialAssets={leadAssetViews}
            listTitle="Your team's high value equipment"
          />
        </div>
      </details>

      {/* Team settings */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Team settings</span>
          <span className="th-sec-preview">Description and logo</span>
          <span className="th-sec-count">{''}</span>
        </summary>
        <div className="th-body">
          <form action={updateLeadTeamDescriptionAction} className="form-stack hq-compact-form" style={{ maxWidth: 560 }}>
            <input type="hidden" name="team_id" value={team.id} />
            <div className="field">
              <label className="label" htmlFor="lead-team-description">
                Description
              </label>
              <textarea
                className="input hq-textarea"
                id="lead-team-description"
                name="description"
                maxLength={300}
                defaultValue={team.description || ''}
                placeholder="Summarize what your team is building this year."
                rows={4}
              />
              <span className="helper">Maximum 300 characters.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="lead-team-logo">
                Team logo URL
              </label>
              <input
                className="input"
                id="lead-team-logo"
                name="logo_url"
                defaultValue={team.logo_url || ''}
                placeholder="https://example.com/team-logo.png"
              />
              <span className="helper">Leave blank to remove the current logo.</span>
            </div>

            <div className="button-row">
              <button className="button" type="submit">
                Save
              </button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}
