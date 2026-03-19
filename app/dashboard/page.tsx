import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState, getCurrentAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { updateLeadTeamDescriptionAction } from '@/app/dashboard/teams/actions';
import { getReceiptTaskState } from '@/lib/purchases';
import { formatQuarterReportTitle } from '@/lib/reports';

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

export default async function DashboardPage() {
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
    .select('id, full_name, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active) {
    redirect('/login');
  }

  const isAdmin = me.role === 'admin';
  const isPresident = me.role === 'president';

  if (isAdmin || isPresident) {
    const { data: teamsData } = await admin
      .from('teams')
      .select('id, name, description, logo_url, is_active, created_at')
      .eq('is_active', true)
      .order('name');

    const { data: membershipsData } = await admin
      .from('team_memberships')
      .select('id, team_id, user_id, team_role, is_active')
      .eq('is_active', true);

    const teams = (teamsData || []) as Team[];
    const memberships = (membershipsData || []) as Membership[];
    const activeLeadMemberships = memberships.filter((membership) => membership.team_role === 'lead');
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('active', true);
    const { data: rosterMembersData } = await admin.from('team_roster_members').select('id');
    const totalMembers = (count || 0) + (rosterMembersData || []).length;

    return (
      <div className="hq-page">
        <section className="hq-hero">
          <div>
            <p className="hq-eyebrow">{isAdmin ? 'Admin portal' : 'President portal'}</p>
            <h1 className="hq-title">Welcome back, {me.full_name || 'operator'}.</h1>
            <p className="hq-subtitle">
              {isAdmin
                ? 'Use HQ to manage teams, leads, members, and the club&apos;s operating structure.'
                : 'Use HQ to review teams, reports, finances, and member activity with read-only access.'}
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
          {(isAdmin ? adminCards : presidentCards).map((card) => (
            <Link href={card.href} key={card.href} className="hq-admin-link">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  const { data: membershipsData } = await supabase
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('is_active', true)
    .eq('user_id', user.id)
    .eq('team_role', 'lead');

  const myMemberships = (membershipsData || []) as Membership[];
  const primaryTeamId = myMemberships[0]?.team_id;

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

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, description, logo_url, is_active, created_at')
    .eq('id', primaryTeamId)
    .single<Team>();

  if (!team) {
    redirect('/login');
  }

  const { data: teamMembershipsData } = await admin
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('team_id', primaryTeamId)
    .eq('is_active', true);
  const { data: rosterMembersData } = await admin
    .from('team_roster_members')
    .select('id, team_id')
    .eq('team_id', primaryTeamId);

  const teamMemberships = (teamMembershipsData || []) as Membership[];
  const rosterMembers = (rosterMembersData || []) as RosterMember[];
  const memberCount = teamMemberships.length + rosterMembers.length;
  const reportState = await getNextReportState(new Date());
  const cycle = await getCurrentAcademicYear();
  const { data: teamBudget } = await admin
    .from('team_budgets')
    .select('annual_budget_cents')
    .eq('team_id', team.id)
    .eq('academic_year', cycle)
    .maybeSingle();
  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('amount_cents')
    .eq('team_id', team.id)
    .eq('academic_year', cycle);
  const { data: pendingReceiptsData } = await admin
    .from('purchase_logs')
    .select('id, description, purchased_at, payment_method, receipt_path, receipt_not_needed')
    .eq('team_id', team.id)
    .eq('payment_method', 'credit_card')
    .eq('receipt_not_needed', false)
    .is('receipt_path', null)
    .order('purchased_at', { ascending: true });
  const { data: tasksData } = await admin
    .from('tasks')
    .select('id, title, recipient_scope')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  const { data: taskRecipients } = await admin.from('task_recipients').select('task_id, team_id').eq('team_id', team.id);
  const recipientTaskIds = new Set((taskRecipients || []).map((entry) => entry.task_id));
  const teamTasks = (tasksData || []).filter(
    (task) => task.recipient_scope === 'all_teams' || recipientTaskIds.has(task.id)
  );
  const annualBudget = teamBudget?.annual_budget_cents ? teamBudget.annual_budget_cents / 100 : 0;
  const spent = ((purchasesData || []) as Array<{ amount_cents: number }>).reduce(
    (sum, purchase) => sum + purchase.amount_cents / 100,
    0
  );
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
        </section>
      </div>
    </div>
  );
}
