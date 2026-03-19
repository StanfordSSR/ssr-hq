import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { signOutAction } from '@/app/dashboard/teams/actions';
import { switchActiveRoleAction } from '@/app/dashboard/actions';
import { DashboardStatusBanner } from '@/components/dashboard-status-banner';
import { getNextReportState } from '@/lib/academic-calendar';
import { getRoleLabel, getViewerContext } from '@/lib/auth';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/teams', label: 'Teams' },
  { href: '/dashboard/members', label: 'Users' },
  { href: '/dashboard/finances', label: 'Manage Finances' },
  { href: '/dashboard/reports', label: 'Team Reports' },
  { href: '/dashboard/tasks', label: 'Assign Tasks' },
  { href: '/dashboard/settings', label: 'Club Settings' }
];

const presidentNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/teams', label: 'Teams' },
  { href: '/dashboard/members', label: 'Users' },
  { href: '/dashboard/finances', label: 'Finances' },
  { href: '/dashboard/reports', label: 'Team Reports' },
  { href: '/dashboard/tasks', label: 'Tasks' },
  { href: '/dashboard/purchases', label: 'Purchases' },
  { href: '/dashboard/expenses', label: 'Expense Log' },
  { href: '/dashboard/settings', label: 'Club Settings' }
];

const leadNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/members', label: 'Manage Members' },
  { href: '/dashboard/expenses', label: 'Expense Log' },
  { href: '/dashboard/tasks', label: 'Tasks', notificationKey: 'tasks' as const }
];

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, profile, currentRole, availableRoles } = await getViewerContext();

  if (!profile.active) {
    redirect('/login');
  }

  const nav = currentRole === 'admin' ? adminNav : currentRole === 'president' ? presidentNav : leadNav;
  const admin = createAdminClient();
  let hasPendingLeadTasks = false;

  if (currentRole === 'team_lead') {
    const { data: memberships } = await admin
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('team_role', 'lead')
      .eq('is_active', true);

    const myTeamIds = (memberships || []).map((membership) => membership.team_id);

    if (myTeamIds.length > 0) {
      const [{ data: pendingReceipts }, { data: teamTasks }, { data: taskRecipients }, reportState] = await Promise.all([
        admin
          .from('purchase_logs')
          .select('id')
          .in('team_id', myTeamIds)
          .eq('payment_method', 'credit_card')
          .eq('receipt_not_needed', false)
          .is('receipt_path', null)
          .limit(1),
        admin
          .from('tasks')
          .select('id, recipient_scope')
          .eq('is_active', true),
        admin.from('task_recipients').select('task_id, team_id').in('team_id', myTeamIds),
        getNextReportState(new Date())
      ]);

      const recipientTaskIds = new Set((taskRecipients || []).map((entry) => entry.task_id));
      const hasAssignedTasks = (teamTasks || []).some(
        (task) => task.recipient_scope === 'all_teams' || recipientTaskIds.has(task.id)
      );
      const hasPendingReceipts = (pendingReceipts || []).length > 0;
      let hasPendingReport = false;

      if (reportState.reportState === 'open') {
        const { data: submittedReport } = await admin
          .from('team_reports')
          .select('id')
          .in('team_id', myTeamIds)
          .eq('academic_year', reportState.academicYear)
          .eq('quarter', reportState.targetQuarter)
          .eq('status', 'submitted')
          .limit(1)
          .maybeSingle();

        hasPendingReport = !submittedReport;
      }

      hasPendingLeadTasks = hasAssignedTasks || hasPendingReceipts || hasPendingReport;
    }
  }

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((part: string) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  return (
    <div className="hq-shell">
      <header className="hq-topbar">
        <div className="hq-topbar-inner">
          <div className="hq-topbar-left">
            <Link href="/dashboard" className="hq-brand">
              Stanford Student Robotics HQ
            </Link>

            <nav className="hq-nav" aria-label="HQ navigation">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="hq-nav-link">
                  {item.label}
                  {'notificationKey' in item && item.notificationKey === 'tasks' && hasPendingLeadTasks ? (
                    <span className="hq-nav-dot" aria-hidden="true" />
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hq-user">
            <details className="hq-user-menu">
              <summary className="hq-user-summary">
                <span className="hq-avatar">{initials}</span>
                <span className="hq-user-name">{profile.full_name || user.email}</span>
                <span className="hq-user-caret" aria-hidden="true">
                  ▾
                </span>
              </summary>

              <div className="hq-user-dropdown">
                {availableRoles.length > 1 ? (
                  <div className="hq-user-dropdown-group">
                    <span className="hq-user-dropdown-label">Switch profile</span>
                    <div className="hq-user-role-list">
                      {availableRoles.map((role) => (
                        <form key={role} action={switchActiveRoleAction}>
                          <input type="hidden" name="next_role" value={role} />
                          <button
                            className={`hq-user-dropdown-button${role === currentRole ? ' is-active' : ''}`}
                            type="submit"
                            disabled={role === currentRole}
                          >
                            {getRoleLabel(role)}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Link href="/dashboard/profile" className="hq-user-dropdown-link">
                  Personal settings
                </Link>

                <form action={signOutAction}>
                  <button className="hq-user-dropdown-button" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="hq-main">
        <DashboardStatusBanner />
        {children}
      </main>
    </div>
  );
}
