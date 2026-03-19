import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

type QueueRow = {
  id: string;
  notification_type: 'receipt' | 'report';
  team_id: string;
  source_key: string;
  scheduled_for: string;
  payload: Record<string, unknown> | null;
};

function formatScheduledAt(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

export default async function QueuedRemindersPage() {
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
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!me?.active || (me.role !== 'admin' && me.role !== 'president')) {
    redirect('/dashboard');
  }

  const { data: queueData } = await admin
    .from('notification_queue')
    .select('id, notification_type, team_id, source_key, scheduled_for, payload')
    .eq('status', 'queued')
    .order('scheduled_for', { ascending: true });
  const rows = (queueData || []) as QueueRow[];

  const teamIds = Array.from(new Set(rows.map((row) => row.team_id)));
  const [{ data: teamsData }, { data: membershipsData }, { data: authUsers }] = await Promise.all([
    teamIds.length ? admin.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] }),
    teamIds.length
      ? admin.from('team_memberships').select('team_id, user_id').in('team_id', teamIds).eq('team_role', 'lead').eq('is_active', true)
      : Promise.resolve({ data: [] }),
    admin.auth.admin.listUsers()
  ]);

  const teamNameMap = new Map((teamsData || []).map((team) => [team.id, team.name]));
  const emailMap = new Map(authUsers.users.map((authUser) => [authUser.id, authUser.email || '']));
  const teamRecipientMap = new Map<string, string[]>();

  for (const membership of membershipsData || []) {
    if (!teamRecipientMap.has(membership.team_id)) {
      teamRecipientMap.set(membership.team_id, []);
    }
    const email = emailMap.get(membership.user_id);
    if (email) {
      teamRecipientMap.get(membership.team_id)!.push(email);
    }
  }

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{me.role === 'admin' ? 'Admin' : 'President'}</p>
          <h1 className="hq-page-title">Queued reminders</h1>
          <p className="hq-subtitle">Every queued receipt and report reminder, with its next send time and resolved recipient emails.</p>
        </div>
        <div className="hq-page-head-action">
          <Link href="/dashboard/settings" className="button-secondary">
            Back to settings
          </Link>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Queue</p>
            <h2 className="hq-section-title hq-section-title-compact">{rows.length} queued reminders</h2>
          </div>
        </div>

        <div className="hq-audit-list">
          {rows.length > 0 ? (
            rows.map((row) => {
              const recipients = Array.from(new Set(teamRecipientMap.get(row.team_id) || []));
              const summary =
                row.notification_type === 'receipt'
                  ? `Receipt reminder${row.payload?.itemName ? ` for ${String(row.payload.itemName)}` : ''}`
                  : `Report reminder${row.payload?.quarter ? ` for ${String(row.payload.quarter)}` : ''}`;

              return (
                <div key={row.id} className="hq-audit-row">
                  <div className="hq-audit-main">
                    <strong>{summary}</strong>
                    <span>
                      {teamNameMap.get(row.team_id) || 'Unknown team'} · {row.notification_type} ·{' '}
                      {recipients.length > 0 ? recipients.join(', ') : 'No recipient email resolved'}
                    </span>
                  </div>
                  <time dateTime={row.scheduled_for}>{formatScheduledAt(row.scheduled_for)}</time>
                </div>
              );
            })
          ) : (
            <p className="empty-note">No queued reminders right now.</p>
          )}
        </div>
      </section>
    </div>
  );
}
