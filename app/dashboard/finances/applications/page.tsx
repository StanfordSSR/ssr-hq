import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewerContext } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getBudgetSetupState } from '@/lib/budget-plan';
import { createAdminClient } from '@/lib/supabase-admin';
import { formatBudgetMoney, formatTeamBudgetDeadline, normalizeApplicationItems, selectTeamApplicationYear, TEAM_BUDGET_ACADEMIC_YEAR } from '@/lib/team-budget-application-rules';

export default async function BudgetApplicationsPage({ searchParams }: { searchParams?: Promise<{ year?: string | string[] }> }) {
  const { currentRole } = await getViewerContext();
  if (!['admin', 'president', 'vice_president', 'financial_officer'].includes(currentRole)) {
    redirect('/dashboard');
  }

  const setup = await getBudgetSetupState();
  const academicYear = selectTeamApplicationYear(setup, (await searchParams)?.year);
  const admin = createAdminClient();
  const [{ data: teams, error: teamsError }, { data: applications, error: applicationsError }] = await Promise.all([
    admin.from('teams').select('id, name').eq('is_active', true).order('name'),
    admin
      .from('team_budget_applications')
      .select('team_id, status, line_items, updated_at, submitted_at')
      .eq('academic_year', academicYear)
  ]);
  if (teamsError || applicationsError) throw new Error('Could not load team budget applications.');

  const byTeam = new Map((applications || []).map((application) => [application.team_id, application]));
  const submittedCount = (teams || []).filter((team) => byTeam.get(team.id)?.status === 'submitted').length;

  return (
    <div className="hq-page th-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{academicYear}</p>
          <h1 className="hq-page-title">Team budget applications</h1>
          <p className="hq-subtitle">{submittedCount} of {(teams || []).length} active teams submitted{academicYear === TEAM_BUDGET_ACADEMIC_YEAR ? ` · Due ${formatTeamBudgetDeadline()}` : ''}</p>
        </div>
        <div className="hq-page-head-action">
          <Link href="/dashboard/finances/plan" className="button-secondary">Budget plan</Link>
        </div>
      </section>

      <nav className="hq-tab-row" aria-label="Application year">
        {[setup.academicYear, ...(setup.setupState === 'upcoming' ? [] : [setup.nextAcademicYear])].map((year) => (
          <Link
            key={year}
            href={`/dashboard/finances/applications?year=${year}`}
            className={`hq-tab-button ${academicYear === year ? 'hq-tab-button-active' : ''}`}
            aria-current={academicYear === year ? 'page' : undefined}
          >
            {year}
          </Link>
        ))}
      </nav>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Team</th><th>Status</th><th>Requested</th><th>Line items</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            {(teams || []).map((team) => {
              const application = byTeam.get(team.id);
              const items = application ? normalizeApplicationItems(application.line_items) : [];
              const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
              return (
                <tr key={team.id}>
                  <td style={{ fontWeight: 700 }}>{team.name}</td>
                  <td>{application?.status === 'submitted' ? 'Submitted' : application ? 'Draft' : 'Not started'}</td>
                  <td>{application ? formatBudgetMoney(totalCents) : '—'}</td>
                  <td>{items.length}</td>
                  <td>{application ? formatDateLabel(new Date(application.updated_at)) : '—'}</td>
                  <td><Link href={`/dashboard/teams/${team.id}/budget-application?year=${academicYear}`} className="th-link">View →</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
