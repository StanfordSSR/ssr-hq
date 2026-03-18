import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getNextReportState } from '@/lib/academic-calendar';

export default async function PurchasesPage() {
  const supabase = await createClient();
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

  const reportState = getNextReportState(new Date());

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Log purchase</h1>
          <p className="hq-subtitle">
            Purchase logging is not wired up yet, but this page is reserved for receipts, requests, and spending history.
          </p>
        </div>
      </section>

      <div className="hq-lead-grid">
        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>Budget status</h3>
          </div>
          <p className="empty-note">No budget data has been connected yet. Current tracked spend is $0.</p>
        </section>

        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>Reporting reminder</h3>
          </div>
          <p className="empty-note">
            {reportState.reportState === 'open'
              ? `Reporting is open now. Deadline in ${reportState.countdownLabel}.`
              : `${reportState.countdownLabel} until reporting opens.`}
          </p>
        </section>
      </div>
    </div>
  );
}
