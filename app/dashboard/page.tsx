import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState, getCurrentAcademicYear, getReportingWindows, formatDateLabel, formatPacificDateKey } from '@/lib/academic-calendar';
import { updateLeadTeamDescriptionAction } from '@/app/dashboard/teams/actions';
import { getReceiptTaskState } from '@/lib/purchases';
import { formatQuarterReportTitle } from '@/lib/reports';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';

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
  const isFinancialOfficer = currentRole === 'financial_officer';

  if (isAdmin || isPresident || isFinancialOfficer) {
    const [{ data: teamsData }, { data: membershipsData }, { count }, { data: rosterMembersData }] = await Promise.all([
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
      admin.from('team_roster_members').select('id')
    ]);
    const teams = (teamsData || []) as Team[];
    const memberships = (membershipsData || []) as Membership[];
    const activeLeadMemberships = memberships.filter((membership) => membership.team_role === 'lead');
    const totalMembers = (count || 0) + (rosterMembersData || []).length;

    return (
      <div className="hq-page">
        <section className="hq-hero">
          <div>
            <p className="hq-eyebrow">{isAdmin ? 'Admin portal' : isPresident ? 'President portal' : 'Financial officer portal'}</p>
            <h1 className="hq-title">Welcome back, {me.full_name || 'operator'}.</h1>
            <p className="hq-subtitle">
              {isAdmin
                ? "Use HQ to manage teams, leads, members, and the club's operating structure."
                : isPresident
                  ? 'Use HQ to review teams, reports, finances, and member activity with read-only access.'
                  : 'Use HQ to review finances, purchases, receipts, and the shared expense log with read-only access.'}
            </p>
          </div>

          <div className="hq-mini-stats">
            <div className="hq-mini-stat">
              <strong>{teams.length}</strong>
              <span>active teams</span>
            </div>
            <div className="hq-mini-stat">
              <strong>{activeLeadMemberships.length}</strong>
              <span>lead assignments</span>
            </div>
            <div className="hq-mini-stat">
              <strong>{totalMembers}</strong>
              <span>total members</span>
            </div>
          </div>
        </section>

        <section className="hq-admin-grid">
          {(isAdmin ? adminCards : isPresident ? presidentCards : financialOfficerCards).map((card) => (
            <Link href={card.href} key={card.href} className="hq-admin-link">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  const myTeamIds = await getLeadTeamIds(user.id);
  const primaryTeamId = myTeamIds[0];

  if (!primaryTeamId) {
    return (
      <div className="hq-page">
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
        .select('amount_cents, purchased_at')
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
      getReportingWindows(cycle)
    ]);
  const recipientTaskIds = new Set((taskRecipients || []).map((entry) => entry.task_id));
  const completedTaskIds = new Set((taskCompletions || []).map((entry) => entry.task_id));
  const teamTasks = (tasksData || []).filter(
    (task) => !completedTaskIds.has(task.id) && (task.recipient_scope === 'all_teams' || recipientTaskIds.has(task.id))
  );
  const annualBudget = teamBudget?.annual_budget_cents ? teamBudget.annual_budget_cents / 100 : 0;
  const purchases = (purchasesData || []) as Array<{ amount_cents: number; purchased_at: string }>;
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
  const pendingReceipts = (pendingReceiptsData || []) as PendingReceipt[];
  const spentPercent = annualBudget > 0 ? Math.min(100, Math.round((spent / annualBudget) * 100)) : 0;
  const { data: reportRecord } = await admin
    .from('team_reports')
    .select('id, status')
    .eq('team_id', team.id)
    .eq('academic_year', reportState.academicYear)
    .eq('quarter', reportState.targetQuarter)
    .maybeSingle();

  return (
    <div className="hq-page">
      <section className="hq-page-head hq-page-head-lead">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Dashboard</h1>
          <p className="hq-subtitle">
            Stay on top of team health, reporting windows, and spending for {team.name}.
          </p>
        </div>

        <div className="hq-page-head-action hq-page-head-action-lead">
          <Link href="/dashboard/purchases" className="button">
            Log purchase
          </Link>
        </div>
      </section>

      <div className="hq-lead-dashboard">
        <aside className="hq-panel hq-lead-sidebar">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team summary</p>
              <div className="hq-team-title-row">
                {team.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-large" />
                ) : (
                  <div className="hq-team-logo hq-team-logo-large hq-team-logo-fallback">{team.name.slice(0, 1)}</div>
                )}
                <h2 className="hq-section-title hq-section-title-compact">{team.name}</h2>
              </div>
            </div>
          </div>

          <div className="hq-summary-list">
            <div className="hq-summary-row">
              <span>Description</span>
              <strong>{team.description || 'No description added yet.'}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Members</span>
              <strong>{memberCount}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Date created</span>
              <strong>{formatDateLabel(new Date(team.created_at))}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Status</span>
              <strong>{team.is_active ? 'Active' : 'Inactive'}</strong>
            </div>
          </div>

          <form action={updateLeadTeamDescriptionAction} className="form-stack hq-compact-form">
            <input type="hidden" name="team_id" value={team.id} />
            <div className="field">
              <label className="label" htmlFor="lead-team-description">
                Edit description
              </label>
              <textarea
                className="input hq-textarea"
                id="lead-team-description"
                name="description"
                maxLength={300}
                defaultValue={team.description || ''}
                placeholder="Summarize what your team is building this year."
                rows={5}
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
                Save description
              </button>
            </div>
          </form>
        </aside>

        <section className="hq-panel hq-lead-main">
          <div className="hq-lead-overview">
            <div className="hq-lead-overview-copy">
              <p className="hq-eyebrow">Operations</p>
              <h2 className="hq-section-title hq-section-title-compact">Annual summary</h2>
              <p className="hq-subtitle">
                A quick snapshot of cycle timing, reporting readiness, and spending.
              </p>
            </div>

            <div className="hq-budget-ring-wrap">
              <div
                className="hq-budget-ring"
                style={{ '--budget-fill': `${spentPercent}%` } as CSSProperties}
              >
                <div className="hq-budget-ring-inner">
                  <strong>{spentPercent}%</strong>
                  <span>spent</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hq-lead-metrics">
            <div className="hq-lead-metric">
              <span>Annual cycle</span>
              <strong>{cycle}</strong>
            </div>
            <div className="hq-lead-metric">
              <span>Total budget</span>
              <strong>${annualBudget.toLocaleString()}</strong>
            </div>
            <div className="hq-lead-metric">
              <span>Spent so far</span>
              <strong>${spent.toLocaleString()}</strong>
            </div>
          </div>

          <div className="hq-lead-grid hq-lead-grid-secondary">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Tasks</h3>
                <Link href="/dashboard/tasks" className="hq-inline-link">
                  Open tasks
                </Link>
              </div>
              <div className="hq-report-card">
                {reportState.reportState === 'open' && reportRecord?.status !== 'submitted' ? (
                  <div className="hq-summary-row">
                    <span style={{ color: '#8c1515' }}>Report due</span>
                    <strong>{formatQuarterReportTitle(reportState.targetQuarter)}</strong>
                    <strong>{reportState.countdownLabel} remaining</strong>
                  </div>
                ) : null}

                {teamTasks.length > 0 ? (
                  <div className="hq-summary-list">
                    {pendingReceipts.slice(0, 2).map((purchase) => {
                      const receiptState = getReceiptTaskState({
                        paymentMethod: purchase.payment_method,
                        purchasedAt: purchase.purchased_at,
                        receiptPath: purchase.receipt_path,
                        receiptNotNeeded: purchase.receipt_not_needed
                      });

                      return (
                        <div key={purchase.id} className="hq-summary-row">
                          <span style={{ color: receiptState.overdue ? '#8c1515' : undefined }}>
                            {receiptState.overdue ? 'Receipt overdue' : 'Receipt pending'}
                          </span>
                          <strong>Upload receipt for {purchase.description}</strong>
                          <strong>{formatDateLabel(new Date(purchase.purchased_at))}</strong>
                        </div>
                      );
                    })}
                    {teamTasks.slice(0, 3).map((task) => (
                      <div key={task.id} className="hq-summary-row">
                        <span>{task.recipient_scope === 'all_teams' ? 'All teams' : team.name}</span>
                        <strong>{task.title}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  pendingReceipts.length > 0 ? (
                    <div className="hq-summary-list">
                      {pendingReceipts.slice(0, 3).map((purchase) => {
                        const receiptState = getReceiptTaskState({
                          paymentMethod: purchase.payment_method,
                          purchasedAt: purchase.purchased_at,
                          receiptPath: purchase.receipt_path,
                          receiptNotNeeded: purchase.receipt_not_needed
                        });

                        return (
                          <div key={purchase.id} className="hq-summary-row">
                            <span style={{ color: receiptState.overdue ? '#8c1515' : undefined }}>
                              {receiptState.overdue ? 'Receipt overdue' : 'Receipt pending'}
                            </span>
                            <strong>Upload receipt for {purchase.description}</strong>
                            <strong>{formatDateLabel(new Date(purchase.purchased_at))}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-note">No tasks yet.</p>
                  )
                )}
              </div>
            </section>

            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Next report due</h3>
                <span
                  className={`hq-status-chip hq-status-${reportState.reportState === 'open' ? 'open' : 'pending'}`}
                >
                  {reportState.reportState === 'open' ? 'Open now' : 'Not open yet'}
                </span>
              </div>

              <div className="hq-report-card">
                <strong>{formatQuarterReportTitle(reportState.targetQuarter)}</strong>
                <span>{reportState.message}</span>
                <p>{reportState.reportState === 'open' ? `Deadline in ${reportState.countdownLabel}.` : `${reportState.countdownLabel} until reporting opens.`}</p>
                {reportState.reportState === 'open' && reportRecord?.status !== 'submitted' ? (
                  <div className="button-row">
                    <Link href="/dashboard/reports" className="button">
                      Open report
                    </Link>
                  </div>
                ) : null}
                {reportRecord?.status === 'submitted' ? <p>Submitted for this quarter.</p> : null}
              </div>
            </section>
          </div>

          <section className="hq-lead-block hq-quarter-spend-block">
            <div className="hq-block-head">
              <h3>Money spent per quarter</h3>
              <span className="hq-inline-note">{cycle} cycle</span>
            </div>

            <div className="hq-quarter-spend-grid">
              {quarterlySpend.map((entry) => {
                const visual = getQuarterVisual(entry.quarter);

                return (
                <div key={entry.quarter} className={`hq-quarter-spend-card hq-quarter-spend-card-${visual.tone}`}>
                  <div className="hq-quarter-spend-head">
                    <span>{visual.label}</span>
                    <small>{visual.mark}</small>
                  </div>
                  <strong>
                    ${entry.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
              );
              })}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
