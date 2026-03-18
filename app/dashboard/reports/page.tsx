import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  formatDateLabel,
  formatPacificDateKey,
  getNextReportState,
  getReportingWindow
} from '@/lib/academic-calendar';
import { formatQuarterKey, formatQuarterReportTitle, getOpenReportContext } from '@/lib/reports';
import { TeamReportEditor } from '@/components/team-report-editor';

type Team = {
  id: string;
  name: string;
};

type Membership = {
  team_id: string;
};

type Question = {
  id: string;
  prompt: string;
  field_type: 'short_text' | 'long_text' | 'member_count' | 'funds_spent';
  word_limit: number;
  sort_order: number;
  is_active?: boolean;
};

type Report = {
  id: string;
  team_id: string;
  academic_year: string;
  quarter: string;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
  updated_at: string;
};

type Answer = {
  question_id: string;
  answer: string | null;
};

function readSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export default async function ReportsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
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

  if (isAdmin) {
    const reportState = getNextReportState(new Date());
    const currentKey = formatQuarterKey(reportState);
    const { data: reportsData } = await admin
      .from('team_reports')
      .select('id, team_id, academic_year, quarter, status, submitted_at, updated_at')
      .order('updated_at', { ascending: false });
    const reports = (reportsData || []) as Report[];
    const { data: teamsData } = await admin.from('teams').select('id, name').order('name');
    const teamNameMap = new Map(((teamsData || []) as Team[]).map((team) => [team.id, team.name]));

    const currentReports = reports.filter(
      (report) => report.academic_year === currentKey.academicYear && report.quarter === currentKey.quarter
    );
    const historyReports = reports.filter(
      (report) => report.academic_year !== currentKey.academicYear || report.quarter !== currentKey.quarter
    );
    const selectedReportId = readSingle(params.report_id);
    const selectedReport = reports.find((report) => report.id === selectedReportId) || null;

    let answers: Answer[] = [];
    let questionMap = new Map<string, Question>();
    if (selectedReport) {
      const { data: answersData } = await admin
        .from('team_report_answers')
        .select('question_id, answer')
        .eq('report_id', selectedReport.id);
      answers = (answersData || []) as Answer[];

      const questionIds = answers.map((answer) => answer.question_id);
      if (questionIds.length > 0) {
        const { data: questionsData } = await admin
          .from('report_questions')
          .select('id, prompt, field_type, word_limit, sort_order')
          .in('id', questionIds);
        questionMap = new Map(((questionsData || []) as Question[]).map((question) => [question.id, question]));
      }
    }

    if (selectedReport) {
      return (
        <div className="hq-page">
          <section className="hq-page-head">
            <div className="hq-page-head-copy">
              <p className="hq-eyebrow">Admin</p>
              <h1 className="hq-page-title">Report detail</h1>
              <p className="hq-subtitle">
                {teamNameMap.get(selectedReport.team_id) || 'Unknown team'} · {selectedReport.quarter} · {selectedReport.academic_year}
              </p>
            </div>

            <div className="hq-page-head-action">
              <Link href="/dashboard/reports" className="button-secondary">
                ← Back to reports
              </Link>
            </div>
          </section>

          <section className="hq-panel hq-surface-muted">
            <div className="hq-summary-list">
              <div className="hq-summary-row">
                <span>Team</span>
                <strong>{teamNameMap.get(selectedReport.team_id) || 'Unknown team'}</strong>
              </div>
              <div className="hq-summary-row">
                <span>Quarter</span>
                <strong>
                  {selectedReport.quarter} · {selectedReport.academic_year}
                </strong>
              </div>
              <div className="hq-summary-row">
                <span>Status</span>
                <strong>{selectedReport.status}</strong>
              </div>
              <div className="hq-summary-row">
                <span>Submitted</span>
                <strong>
                  {selectedReport.submitted_at ? formatDateLabel(new Date(selectedReport.submitted_at)) : 'Draft only'}
                </strong>
              </div>
            </div>
          </section>

          <section className="hq-panel hq-surface-muted">
            <div className="hq-question-stack">
              {answers
                .sort((a, b) => (questionMap.get(a.question_id)?.sort_order || 0) - (questionMap.get(b.question_id)?.sort_order || 0))
                .map((answer) => {
                  const question = questionMap.get(answer.question_id);
                  if (!question) {
                    return null;
                  }

                  return (
                    <div key={answer.question_id} className="hq-question-card">
                      <h3>{question.prompt}</h3>
                      <p>{answer.answer || 'No answer provided.'}</p>
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Admin</p>
            <h1 className="hq-page-title">Team reports</h1>
            <p className="hq-subtitle">Review the current quarter submissions and browse report history across teams.</p>
          </div>
        </section>

        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>This quarter</h3>
            <span className="hq-inline-note">
              {currentKey.quarter}, {currentKey.academicYear}
            </span>
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

                  <Link href={`/dashboard/reports?report_id=${report.id}`} className="hq-inline-link hq-inline-link-accent">
                    View →
                  </Link>
                </div>
              ))
            ) : (
              <p className="empty-note">No reports yet for the current quarter.</p>
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
                    <span>
                      {teamNameMap.get(report.team_id) || 'Unknown team'} · {report.quarter}
                    </span>
                    <strong>{report.academic_year}</strong>
                    <strong>{report.submitted_at ? formatDateLabel(new Date(report.submitted_at)) : 'Draft only'}</strong>
                  </div>

                  <Link href={`/dashboard/reports?report_id=${report.id}`} className="hq-inline-link hq-inline-link-accent">
                    View →
                  </Link>
                </div>
              ))
            ) : (
              <p className="empty-note">No past reports yet.</p>
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
  const memberships = (membershipsData || []) as Membership[];
  const teamId = memberships[0]?.team_id;

  if (!teamId) {
    redirect('/dashboard');
  }

  const reportContext = getOpenReportContext(new Date());
  const reportKey = formatQuarterKey(reportContext.reportState);
  const { data: team } = await admin.from('teams').select('id, name').eq('id', teamId).single<Team>();
  const memberCountData = await Promise.all([
    admin
      .from('team_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin
      .from('team_roster_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
  ]);
  const memberCount = (memberCountData[0].count || 0) + (memberCountData[1].count || 0);

  const { data: questionsData } = await admin
    .from('report_questions')
    .select('id, prompt, field_type, word_limit, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order');
  const questions = (questionsData || []) as Question[];
  const reportingWindow = getReportingWindow(reportKey.academicYear, reportKey.quarter);
  const { data: quarterPurchasesData } = await admin
    .from('purchase_logs')
    .select('amount_cents, purchased_at')
    .eq('team_id', teamId)
    .eq('academic_year', reportKey.academicYear);
  const quarterStartKey = reportingWindow ? formatPacificDateKey(reportingWindow.start) : '';
  const quarterEndKey = reportingWindow ? formatPacificDateKey(reportingWindow.end) : '';
  const quarterFundsSpentCents = ((quarterPurchasesData || []) as Array<{ amount_cents: number; purchased_at: string }>).reduce(
    (sum, purchase) => {
      if (!quarterStartKey || !quarterEndKey) {
        return sum;
      }
      const purchaseKey = formatPacificDateKey(new Date(purchase.purchased_at));
      if (purchaseKey < quarterStartKey || purchaseKey > quarterEndKey) {
        return sum;
      }
      return sum + purchase.amount_cents;
    },
    0
  );
  const reportTitle = formatQuarterReportTitle(reportKey.quarter);

  const { data: report } = await admin
    .from('team_reports')
    .select('id, team_id, academic_year, quarter, status, submitted_at, updated_at')
    .eq('team_id', teamId)
    .eq('academic_year', reportKey.academicYear)
    .eq('quarter', reportKey.quarter)
    .maybeSingle<Report>();

  const { data: answersData } = report
    ? await admin.from('team_report_answers').select('question_id, answer').eq('report_id', report.id)
    : { data: [] };
  const answers = new Map(((answersData || []) as Answer[]).map((answer) => [answer.question_id, answer.answer || '']));

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">{reportTitle}</h1>
          <p className="hq-subtitle">Save your answers as a draft or submit the report once your team is ready.</p>
        </div>
      </section>

      {!reportContext.canSubmit ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-report-card">
            <strong>{reportContext.reportState.targetQuarter}</strong>
            <span>{reportContext.reportState.message}</span>
            <p>Submission opens on {formatDateLabel(reportContext.reportState.openAt)}.</p>
          </div>
        </section>
      ) : report?.status === 'submitted' ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-report-card">
            <strong>Report submitted</strong>
            <span>
              {team?.name || 'Your team'} submitted {reportTitle} for {reportKey.academicYear}.
            </span>
            <p>{report.submitted_at ? `Submitted on ${formatDateLabel(new Date(report.submitted_at))}.` : 'Submission complete.'}</p>
          </div>
        </section>
      ) : (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>
              {team?.name || 'Your team'} · {reportKey.quarter}
            </h3>
            <span className="hq-inline-note">{reportKey.academicYear}</span>
          </div>

          <TeamReportEditor
            teamId={teamId}
            academicYear={reportKey.academicYear}
            quarter={reportKey.quarter}
            questions={questions.map((question) => ({
              id: question.id,
              prompt: question.prompt,
              fieldType: question.field_type,
              wordLimit: question.word_limit,
              answer:
                question.field_type === 'member_count'
                  ? String(memberCount)
                  : question.field_type === 'funds_spent'
                    ? formatCurrency(quarterFundsSpentCents)
                    : answers.get(question.id) || ''
            }))}
          />
        </section>
      )}
    </div>
  );
}
