import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { formatAcademicYear } from '@/lib/academic-calendar';
import {
  assignPresidentRoleAction,
  removePresidentRoleAction,
  updateReceiptNotificationSettingsAction,
  updateReportNotificationSettingsAction
} from '@/app/dashboard/actions';
import { getReceiptNotificationSettings } from '@/lib/receipt-workflow';
import { ReportQuestionEditor } from '@/components/report-question-editor';
import { normalizeReminderDays } from '@/lib/purchases';

function formatAuditTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export default async function SettingsPage() {
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

  if (!me?.active || me.role !== 'admin') {
    redirect('/dashboard');
  }
  const receiptSettings = await getReceiptNotificationSettings();
  const { data: reportQuestionsData } = await admin
    .from('report_questions')
    .select('id, prompt, field_type, word_limit, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  const reportQuestions = (reportQuestionsData || []).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    fieldType: question.field_type,
    wordLimit: question.word_limit
  }));
  const { data: reportNotificationSettings } = await admin
    .from('report_notification_settings')
    .select('email_enabled, reminder_days')
    .eq('id', 1)
    .maybeSingle();
  const reportReminderDays = normalizeReminderDays(reportNotificationSettings?.reminder_days || [14, 7, 1]);
  const { data: queuedNotificationsData } = await admin
    .from('notification_queue')
    .select('id, notification_type')
    .eq('status', 'queued');
  const queuedNotifications = queuedNotificationsData || [];
  const receiptQueueCount = queuedNotifications.filter((row) => row.notification_type === 'receipt').length;
  const reportQueueCount = queuedNotifications.filter((row) => row.notification_type === 'report').length;
  const { data: auditEntriesData } = await admin
    .from('audit_log_entries')
    .select('id, actor_id, action, target_type, target_id, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  const auditEntries = auditEntriesData || [];
  const actorIds = Array.from(new Set(auditEntries.map((entry) => entry.actor_id).filter(Boolean))) as string[];
  const { data: actorProfiles } = actorIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] };
  const actorNameMap = new Map((actorProfiles || []).map((profile) => [profile.id, profile.full_name || 'Unknown user']));
  const { data: allProfilesData } = await admin
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('active', true)
    .order('full_name');
  const allProfiles = allProfilesData || [];
  const presidents = allProfiles.filter((profile) => profile.role === 'president');
  const presidentCandidates = allProfiles.filter((profile) => profile.role !== 'admin' && profile.role !== 'president');

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Admin</p>
          <h1 className="hq-page-title">Club settings</h1>
          <p className="hq-subtitle">A home for club-wide operating settings, cycle references, and future portal controls.</p>
        </div>
      </section>

      <section className="hq-panel">
        <div className="hq-settings-grid">
          <div className="hq-setting-tile">
            <strong>Current academic cycle</strong>
            <span>{formatAcademicYear(new Date())}</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Task assignment</strong>
            <span>Managed from the Assign Tasks page.</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Team branding</strong>
            <span>Team logos can be updated from Manage Teams and the lead dashboard.</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Queued reminders</strong>
            <span>
              {queuedNotifications.length} queued total
              <br />
              {receiptQueueCount} receipt, {reportQueueCount} report
            </span>
          </div>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Leadership</p>
            <h2 className="hq-section-title hq-section-title-compact">President access</h2>
          </div>
        </div>

        <div className="hq-lead-grid">
          <section className="hq-lead-block">
            <div className="hq-block-head">
              <h3>Current presidents</h3>
            </div>

            {presidents.length > 0 ? (
              <div className="hq-summary-list">
                {presidents.map((profile) => (
                  <div key={profile.id} className="hq-summary-row">
                    <span>Read-only portal access</span>
                    <strong>{profile.full_name || 'Unnamed user'}</strong>
                    <form action={removePresidentRoleAction}>
                      <input type="hidden" name="profile_id" value={profile.id} />
                      <button className="button-secondary" type="submit">
                        Remove
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">No presidents assigned yet.</p>
            )}
          </section>

          <section className="hq-lead-block">
            <div className="hq-block-head">
              <h3>Assign president</h3>
            </div>

            <form action={assignPresidentRoleAction} className="form-stack">
              <div className="field">
                <label className="label" htmlFor="president-profile-id">
                  Portal user
                </label>
                <select className="select" id="president-profile-id" name="profile_id" defaultValue="">
                  <option value="" disabled>
                    Select a portal user
                  </option>
                  {presidentCandidates.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.id.slice(0, 8)} · {profile.role === 'team_lead' ? 'Lead' : profile.role}
                    </option>
                  ))}
                </select>
                <span className="helper">Presidents can view all portal pages but cannot edit anything.</span>
              </div>

              <div className="button-row">
                <button className="button" type="submit">
                  Assign president
                </button>
              </div>
            </form>
          </section>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Receipts</p>
            <h2 className="hq-section-title hq-section-title-compact">Receipt reminder settings</h2>
          </div>
        </div>

        <form action={updateReceiptNotificationSettingsAction} className="form-stack">
          <label className="hq-switch">
            <input type="checkbox" name="email_enabled" defaultChecked={receiptSettings.emailEnabled} />
            <span className="hq-switch-track" aria-hidden="true" />
            <span className="hq-switch-copy">
              <strong>Email team leads</strong>
              <small>Turn receipt reminder emails on or off without changing the in-portal receipt tasks.</small>
            </span>
          </label>

          <div className="hq-inline-grid">
            <div className="field">
              <label className="label" htmlFor="reminder-day-one">
                Reminder 1
              </label>
              <input
                className="input"
                id="reminder-day-one"
                name="reminder_day_one"
                type="number"
                min="1"
                max="365"
                defaultValue={receiptSettings.reminderDays[0] || ''}
                placeholder="3"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="reminder-day-two">
                Reminder 2
              </label>
              <input
                className="input"
                id="reminder-day-two"
                name="reminder_day_two"
                type="number"
                min="1"
                max="365"
                defaultValue={receiptSettings.reminderDays[1] || ''}
                placeholder="7"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="reminder-day-three">
              Reminder 3
            </label>
            <input
              className="input"
              id="reminder-day-three"
              name="reminder_day_three"
              type="number"
              min="1"
              max="365"
              defaultValue={receiptSettings.reminderDays[2] || ''}
              placeholder="14"
            />
            <span className="helper">Set up to three reminder timings in days after purchase. Leave a field blank to skip it.</span>
          </div>

          <div className="button-row">
            <button className="button" type="submit">
              Save receipt settings
            </button>
          </div>
        </form>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Reports</p>
            <h2 className="hq-section-title hq-section-title-compact">Quarterly report questions</h2>
          </div>
        </div>

        <ReportQuestionEditor initialQuestions={reportQuestions} />
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Reports</p>
            <h2 className="hq-section-title hq-section-title-compact">Report reminder settings</h2>
          </div>
        </div>

        <form action={updateReportNotificationSettingsAction} className="form-stack">
          <label className="hq-switch">
            <input
              type="checkbox"
              name="report_email_enabled"
              defaultChecked={reportNotificationSettings?.email_enabled ?? true}
            />
            <span className="hq-switch-track" aria-hidden="true" />
            <span className="hq-switch-copy">
              <strong>Email team leads</strong>
              <small>Control whether report due reminders send email in addition to showing up in HQ.</small>
            </span>
          </label>

          <div className="hq-inline-grid">
            <div className="field">
              <label className="label" htmlFor="report-reminder-one">
                Reminder 1
              </label>
              <input
                className="input"
                id="report-reminder-one"
                name="report_reminder_day_one"
                type="number"
                min="1"
                max="365"
                defaultValue={reportReminderDays[0] || ''}
                placeholder="14"
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="report-reminder-two">
                Reminder 2
              </label>
              <input
                className="input"
                id="report-reminder-two"
                name="report_reminder_day_two"
                type="number"
                min="1"
                max="365"
                defaultValue={reportReminderDays[1] || ''}
                placeholder="7"
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="report-reminder-three">
              Reminder 3
            </label>
            <input
              className="input"
              id="report-reminder-three"
              name="report_reminder_day_three"
              type="number"
              min="1"
              max="365"
              defaultValue={reportReminderDays[2] || ''}
              placeholder="1"
            />
            <span className="helper">Set up to three report reminder timings in days before the due date.</span>
          </div>

          <div className="button-row">
            <button className="button" type="submit">
              Save report reminders
            </button>
          </div>
        </form>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-section-head">
          <div className="hq-section-head-copy">
            <p className="hq-eyebrow">Audit</p>
            <h2 className="hq-section-title hq-section-title-compact">Recent audit log</h2>
          </div>
        </div>

        <div className="hq-audit-list">
          {auditEntries.length > 0 ? (
            auditEntries.map((entry) => (
              <div key={entry.id} className="hq-audit-row">
                <div className="hq-audit-main">
                  <strong>{entry.summary}</strong>
                  <span>
                    {entry.actor_id ? actorNameMap.get(entry.actor_id) || 'Unknown user' : 'System'} · {entry.action} ·{' '}
                    {entry.target_type}
                  </span>
                </div>
                <time dateTime={entry.created_at}>{formatAuditTimestamp(entry.created_at)}</time>
              </div>
            ))
          ) : (
            <p className="empty-note">Audit events will appear here as teams, finances, reports, and reminders change.</p>
          )}
        </div>
      </section>
    </div>
  );
}
