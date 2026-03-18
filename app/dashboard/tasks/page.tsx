import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getNextReportState, formatDateLabel } from '@/lib/academic-calendar';

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active) {
    redirect('/login');
  }

  const reportState = getNextReportState(new Date());

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Tasks</h1>
          <p className="hq-subtitle">A focused queue for upcoming work, reporting, and operations.</p>
        </div>
      </section>

      <div className="hq-lead-grid">
        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>Current tasks</h3>
          </div>
          <p className="empty-note">No tasks have been assigned yet.</p>
        </section>

        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>Quarterly report</h3>
            <span
              className={`hq-status-chip hq-status-${reportState.reportState === 'open' ? 'open' : 'pending'}`}
            >
              {reportState.reportState === 'open' ? 'Open now' : 'Upcoming'}
            </span>
          </div>
          <div className="hq-report-card">
            <strong>{reportState.targetQuarter}</strong>
            <span>{reportState.message}</span>
            <p>
              {reportState.reportState === 'open'
                ? `Submit by ${formatDateLabel(reportState.dueAt)}.`
                : `Submission opens on ${formatDateLabel(reportState.openAt)}.`}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
