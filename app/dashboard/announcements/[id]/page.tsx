import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { submitAnnouncementRsvpAction } from '@/app/dashboard/actions';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getLeadTeamIds } from '@/lib/lead-state';

export default async function AnnouncementDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const { user, currentRole } = await getViewerContext();

  const { data: announcement } = await admin
    .from('announcements')
    .select('id, title, details, location, event_at, recipient_scope, is_active')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (!announcement) {
    redirect('/dashboard/tasks');
  }

  if (currentRole === 'team_lead') {
    const myTeamIds = await getLeadTeamIds(user.id);
    if (announcement.recipient_scope !== 'all_teams') {
      const { data: recipient } = await admin
        .from('announcement_recipients')
        .select('announcement_id')
        .eq('announcement_id', id)
        .in('team_id', myTeamIds)
        .limit(1)
        .maybeSingle();

      if (!recipient) {
        redirect('/dashboard/tasks');
      }
    }
  }

  const [{ data: myRsvp }, { data: rsvps }] = await Promise.all([
    admin
      .from('announcement_rsvps')
      .select('response')
      .eq('announcement_id', id)
      .eq('profile_id', user.id)
      .maybeSingle(),
    admin.from('announcement_rsvps').select('response').eq('announcement_id', id)
  ]);

  const yesCount = (rsvps || []).filter((row) => row.response === 'yes').length;
  const maybeCount = (rsvps || []).filter((row) => row.response === 'maybe').length;
  const noCount = (rsvps || []).filter((row) => row.response === 'no').length;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Event notification</p>
          <h1 className="hq-page-title">{announcement.title}</h1>
          <p className="hq-subtitle">Review the event details and save your RSVP.</p>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-summary-list">
          <div className="hq-summary-row">
            <span>Date and time</span>
            <strong>{formatDateLabel(new Date(announcement.event_at))} · {new Date(announcement.event_at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Location</span>
            <strong>{announcement.location}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Details</span>
            <strong>{announcement.details || 'No extra details provided yet.'}</strong>
          </div>
        </div>

        <div className="hq-announcement-rsvp-wrap">
          <div className="hq-block-head">
            <h3>RSVP</h3>
            <span className="hq-inline-note">Current response: {myRsvp?.response || 'none yet'}</span>
          </div>
          <div className="button-row">
            {['yes', 'maybe', 'no'].map((response) => (
              <form key={response} action={submitAnnouncementRsvpAction}>
                <input type="hidden" name="announcement_id" value={announcement.id} />
                <input type="hidden" name="response" value={response} />
                <button className={myRsvp?.response === response ? 'button' : 'button-secondary'} type="submit">
                  {response === 'yes' ? 'Yes' : response === 'maybe' ? 'Maybe' : 'No'}
                </button>
              </form>
            ))}
          </div>
        </div>

        <div className="hq-summary-list">
          <div className="hq-summary-row">
            <span>Yes</span>
            <strong>{yesCount}</strong>
          </div>
          <div className="hq-summary-row">
            <span>Maybe</span>
            <strong>{maybeCount}</strong>
          </div>
          <div className="hq-summary-row">
            <span>No</span>
            <strong>{noCount}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}
