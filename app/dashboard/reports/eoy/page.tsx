import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import {
  EOY_REPORT_TITLE,
  applyEoyQuestionTokens,
  emptyEoyReportData,
  formatEoyCurrency,
  getEoyReportSettings,
  getEoyReportState,
  getEoyTeamMembers,
  getTeamAnnualBudgetCents,
  getYearFundsSpentCents,
  yearSummaryWordLimit,
  type EoyReportData
} from '@/lib/eoy-report';
import { EoyReportEditor } from '@/components/eoy-report-editor';

type Team = { id: string; name: string };

type EoyReportRow = {
  id: string;
  team_id: string;
  academic_year: string;
  status: 'draft' | 'submitted';
  data: EoyReportData;
  submitted_at: string | null;
  updated_at: string;
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

async function getTeamMemberCount(teamId: string) {
  const admin = createAdminClient();
  const [{ count: membershipCount }, { count: rosterCount }] = await Promise.all([
    admin
      .from('team_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin.from('team_roster_members').select('id', { count: 'exact', head: true }).eq('team_id', teamId)
  ]);
  return (membershipCount || 0) + (rosterCount || 0);
}

export default async function EoyReportPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const admin = createAdminClient();
  const { user, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isPresident = currentRole === 'president';

  const state = await getEoyReportState(new Date());
  const settings = await getEoyReportSettings();

  if (isAdmin || isPresident) {
    const { data: reportsData } = await admin
      .from('eoy_reports')
      .select('id, team_id, academic_year, status, data, submitted_at, updated_at')
      .order('updated_at', { ascending: false });
    const reports = (reportsData || []) as EoyReportRow[];
    const { data: teamsData } = await admin.from('teams').select('id, name').order('name');
    const teamNameMap = new Map(((teamsData || []) as Team[]).map((team) => [team.id, team.name]));

    const selectedReportId = readSingle(params.report_id);
    const selectedReport = reports.find((report) => report.id === selectedReportId) || null;

    if (selectedReport) {
      const teamName = teamNameMap.get(selectedReport.team_id) || 'Unknown team';
      const stored = { ...emptyEoyReportData(), ...selectedReport.data };
      const questions = applyEoyQuestionTokens(settings.questions, {
        team: teamName,
        nextYear: state.nextAcademicYear
      });

      return (
        <div className="hq-page">
          <section className="hq-page-head">
            <div className="hq-page-head-copy">
              <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'President'}</p>
              <h1 className="hq-page-title">End-of-year report detail</h1>
              <p className="hq-subtitle">
                {teamName} · {selectedReport.academic_year} · {selectedReport.status}
              </p>
            </div>
            <div className="hq-page-head-action">
              <Link href="/dashboard/reports/eoy" className="button-secondary">
                ← Back to reports
              </Link>
            </div>
          </section>

          <section className="hq-panel hq-surface-muted">
            <EoyReportEditor
              teamId={selectedReport.team_id}
              academicYear={selectedReport.academic_year}
              nextAcademicYear={state.nextAcademicYear}
              teamName={teamName}
              members={[]}
              questions={questions}
              autofill={stored.autofill}
              yearSummaryLimit={yearSummaryWordLimit(stored.autofill.annualBudgetCents)}
              initialData={stored}
              readOnly
            />
          </section>
        </div>
      );
    }

    const currentReports = reports.filter((report) => report.academic_year === state.academicYear);
    const historyReports = reports.filter((report) => report.academic_year !== state.academicYear);

    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'President'}</p>
            <h1 className="hq-page-title">{EOY_REPORT_TITLE}</h1>
            <p className="hq-subtitle">{state.message}</p>
          </div>
        </section>

        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>This year</h3>
            <span className="hq-inline-note">{state.academicYear}</span>
          </div>
          <div className="hq-summary-list">
            {currentReports.length > 0 ? (
              currentReports.map((report) => (
                <div key={report.id} className="hq-report-list-row">
                  <div className="hq-report-list-copy">
                    <span>{teamNameMap.get(report.team_id) || 'Unknown team'}</span>
                    <strong>{report.status === 'submitted' ? 'Submitted' : 'Draft saved'}</strong>
                    <strong>
                      {report.submitted_at
                        ? formatDateLabel(new Date(report.submitted_at))
                        : formatDateLabel(new Date(report.updated_at))}
                    </strong>
                  </div>
                  <Link
                    href={`/dashboard/reports/eoy?report_id=${report.id}`}
                    className="hq-inline-link hq-inline-link-accent"
                  >
                    View →
                  </Link>
                </div>
              ))
            ) : (
              <p className="empty-note">No end-of-year reports yet for {state.academicYear}.</p>
            )}
          </div>
        </section>

        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>Past reports</h3>
          </div>
          <div className="hq-summary-list">
            {historyReports.length > 0 ? (
              historyReports.map((report) => (
                <div key={report.id} className="hq-report-list-row">
                  <div className="hq-report-list-copy">
                    <span>{teamNameMap.get(report.team_id) || 'Unknown team'}</span>
                    <strong>{report.academic_year}</strong>
                    <strong>
                      {report.submitted_at ? formatDateLabel(new Date(report.submitted_at)) : 'Draft only'}
                    </strong>
                  </div>
                  <Link
                    href={`/dashboard/reports/eoy?report_id=${report.id}`}
                    className="hq-inline-link hq-inline-link-accent"
                  >
                    View →
                  </Link>
                </div>
              ))
            ) : (
              <p className="empty-note">No past end-of-year reports yet.</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  const { data: membershipsData } = await admin
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true);
  const teamId = (membershipsData || [])[0]?.team_id;
  if (!teamId) {
    redirect('/dashboard');
  }

  const { data: team } = await admin.from('teams').select('id, name').eq('id', teamId).single<Team>();
  const teamName = team?.name || 'Your team';

  const [totalMembers, fundsSpentThisYearCents, annualBudgetCents, members, report] = await Promise.all([
    getTeamMemberCount(teamId),
    getYearFundsSpentCents(teamId, state.academicYear),
    getTeamAnnualBudgetCents(teamId, state.academicYear),
    getEoyTeamMembers(teamId),
    admin
      .from('eoy_reports')
      .select('id, team_id, academic_year, status, data, submitted_at, updated_at')
      .eq('team_id', teamId)
      .eq('academic_year', state.academicYear)
      .maybeSingle<EoyReportRow>()
      .then((result) => result.data)
  ]);
  const remainingFundingCents = Math.max(0, annualBudgetCents - fundsSpentThisYearCents);
  const autofill = { totalMembers, fundsSpentThisYearCents, annualBudgetCents, remainingFundingCents };

  const questions = applyEoyQuestionTokens(settings.questions, {
    team: teamName,
    nextYear: state.nextAcademicYear
  });
  const initialData = report?.data ? { ...emptyEoyReportData(), ...report.data } : emptyEoyReportData();

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">{EOY_REPORT_TITLE}</h1>
          <p className="hq-subtitle">{state.message}</p>
        </div>
      </section>

      {state.reportState === 'upcoming' ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-report-card">
            <strong>{EOY_REPORT_TITLE}</strong>
            <span>{state.message}</span>
            <p>Opens on {formatDateLabel(state.openAt)} and is due {formatDateLabel(state.dueAt)}.</p>
          </div>
        </section>
      ) : state.reportState === 'closed' && report?.status !== 'submitted' ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-report-card">
            <strong>Submissions closed</strong>
            <span>{state.message}</span>
            <p>Contact a president or admin if you still need to submit.</p>
          </div>
        </section>
      ) : report?.status === 'submitted' ? (
        <>
          <section className="hq-panel hq-surface-muted">
            <div className="hq-report-card">
              <strong>Report submitted</strong>
              <span>
                {teamName} submitted the {state.academicYear} end-of-year report
                {report.submitted_at ? ` on ${formatDateLabel(new Date(report.submitted_at))}` : ''}.
              </span>
              <p>
                Remaining funding at submission: {formatEoyCurrency(initialData.autofill.remainingFundingCents)}.
              </p>
            </div>
          </section>

          <section className="hq-panel hq-surface-muted">
            <EoyReportEditor
              teamId={teamId}
              academicYear={state.academicYear}
              nextAcademicYear={state.nextAcademicYear}
              teamName={teamName}
              members={members}
              questions={questions}
              autofill={initialData.autofill}
              yearSummaryLimit={yearSummaryWordLimit(initialData.autofill.annualBudgetCents)}
              initialData={initialData}
              readOnly
            />
          </section>
        </>
      ) : (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>
              {teamName} · {state.academicYear}
            </h3>
            <span className="hq-inline-note">Due {formatDateLabel(state.dueAt)}</span>
          </div>

          <EoyReportEditor
            teamId={teamId}
            academicYear={state.academicYear}
            nextAcademicYear={state.nextAcademicYear}
            teamName={teamName}
            members={members}
            questions={questions}
            autofill={autofill}
            yearSummaryLimit={yearSummaryWordLimit(annualBudgetCents)}
            initialData={initialData}
          />
        </section>
      )}
    </div>
  );
}
