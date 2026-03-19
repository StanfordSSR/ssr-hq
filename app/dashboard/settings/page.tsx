import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getAcademicCalendarTemplate, getCurrentAcademicYear, getReportingWindows, formatDateLabel } from '@/lib/academic-calendar';
import {
  assignPresidentRoleAction,
  invitePresidentAction,
  removePresidentRoleAction,
  updateAcademicCalendarSettingsAction,
  updateReceiptNotificationSettingsAction,
  updateReportNotificationSettingsAction
} from '@/app/dashboard/actions';
import { getReceiptNotificationSettings } from '@/lib/receipt-workflow';
import { ReportQuestionEditor } from '@/components/report-question-editor';
import { normalizeReminderDays } from '@/lib/purchases';

type SettingsTab = 'board' | 'reminders' | 'reporting' | 'audit';

function formatAuditTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function readTab(value: string | string[] | undefined): SettingsTab {
  const raw = Array.isArray(value) ? value[0] || '' : value || '';
  return raw === 'board' || raw === 'reminders' || raw === 'reporting' || raw === 'audit' ? raw : 'board';
}

export default async function SettingsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) || {};
  const tab = readTab(params.tab);
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

  const canEdit = me.role === 'admin';
  const currentAcademicYear = await getCurrentAcademicYear();
  const calendarTemplate = await getAcademicCalendarTemplate();
  const reportingWindows = await getReportingWindows(currentAcademicYear);
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

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'board', label: 'Board' },
    { id: 'reminders', label: 'Reminders' },
    { id: 'reporting', label: 'Reporting' },
    { id: 'audit', label: 'Audit log' }
  ];

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : 'President'}</p>
          <h1 className="hq-page-title">Club settings</h1>
          <p className="hq-subtitle">
            {canEdit
              ? 'Configure the operating calendar, reminders, reporting setup, and leadership access.'
              : 'Review the operating calendar, reminders, reporting setup, and audit log in read-only mode.'}
          </p>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-settings-grid">
          <div className="hq-setting-tile">
            <strong>Current academic cycle</strong>
            <span>{currentAcademicYear}<br />Auto-rolls forward after summer quarter ends.</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Queued reminders</strong>
            <span>
              {queuedNotifications.length} queued total
              <br />
              {receiptQueueCount} receipt, {reportQueueCount} report
            </span>
          </div>
          <div className="hq-setting-tile">
            <strong>Quarter schedule</strong>
            <span>{reportingWindows[0]?.quarter || 'Autumn Quarter'} through {reportingWindows[3]?.quarter || 'Summer Quarter'}</span>
          </div>
          <div className="hq-setting-tile">
            <strong>Portal mode</strong>
            <span>{canEdit ? 'Editable admin controls' : 'Read-only president view'}</span>
          </div>
        </div>
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-tab-row">
          {tabs.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/settings?tab=${item.id}`}
              className={`hq-tab-button ${tab === item.id ? 'hq-tab-button-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {tab === 'board' ? (
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
                      {canEdit ? (
                        <form action={removePresidentRoleAction}>
                          <input type="hidden" name="profile_id" value={profile.id} />
                          <button className="button-secondary" type="submit">
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No presidents assigned yet.</p>
              )}
            </section>

            {canEdit ? (
              <>
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
                    </div>

                    <div className="button-row">
                      <button className="button" type="submit">
                        Assign president
                      </button>
                    </div>
                  </form>
                </section>

                <section className="hq-lead-block">
                  <details className="hq-compact-disclosure">
                    <summary className="hq-compact-disclosure-summary">
                      <span>Invite new president</span>
                      <span className="hq-user-caret" aria-hidden="true">
                        ▾
                      </span>
                    </summary>

                    <form action={invitePresidentAction} className="form-stack hq-compact-disclosure-body">
                      <div className="field">
                        <label className="label" htmlFor="president-full-name">
                          Full name
                        </label>
                        <input className="input" id="president-full-name" name="full_name" required />
                      </div>

                      <div className="field">
                        <label className="label" htmlFor="president-email">
                          Stanford email
                        </label>
                        <input className="input" id="president-email" name="email" type="email" required />
                      </div>

                      <div className="button-row">
                        <button className="button-secondary" type="submit">
                          Invite president
                        </button>
                      </div>
                    </form>
                  </details>
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {tab === 'reminders' ? (
          <div className="hq-lead-grid">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Receipt reminders</h3>
              </div>
              {canEdit ? (
                <form action={updateReceiptNotificationSettingsAction} className="form-stack">
                  <label className="hq-switch">
                    <input type="checkbox" name="email_enabled" defaultChecked={receiptSettings.emailEnabled} />
                    <span className="hq-switch-track" aria-hidden="true" />
                    <span className="hq-switch-copy">
                      <strong>Email team leads</strong>
                      <small>Turn receipt reminder emails on or off.</small>
                    </span>
                  </label>
                  <div className="hq-inline-grid">
                    <div className="field"><label className="label" htmlFor="reminder-day-one">Reminder 1</label><input className="input" id="reminder-day-one" name="reminder_day_one" type="number" min="1" max="365" defaultValue={receiptSettings.reminderDays[0] || ''} /></div>
                    <div className="field"><label className="label" htmlFor="reminder-day-two">Reminder 2</label><input className="input" id="reminder-day-two" name="reminder_day_two" type="number" min="1" max="365" defaultValue={receiptSettings.reminderDays[1] || ''} /></div>
                  </div>
                  <div className="field"><label className="label" htmlFor="reminder-day-three">Reminder 3</label><input className="input" id="reminder-day-three" name="reminder_day_three" type="number" min="1" max="365" defaultValue={receiptSettings.reminderDays[2] || ''} /></div>
                  <div className="button-row"><button className="button" type="submit">Save receipt settings</button></div>
                </form>
              ) : (
                <div className="hq-summary-list">
                  <div className="hq-summary-row"><span>Email reminders</span><strong>{receiptSettings.emailEnabled ? 'Enabled' : 'Disabled'}</strong></div>
                  <div className="hq-summary-row"><span>Reminder cadence</span><strong>{receiptSettings.reminderDays.map((day) => `Day ${day}`).join(', ')}</strong></div>
                </div>
              )}
            </section>

            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Report reminders</h3>
              </div>
              {canEdit ? (
                <form action={updateReportNotificationSettingsAction} className="form-stack">
                  <label className="hq-switch">
                    <input type="checkbox" name="report_email_enabled" defaultChecked={reportNotificationSettings?.email_enabled ?? true} />
                    <span className="hq-switch-track" aria-hidden="true" />
                    <span className="hq-switch-copy">
                      <strong>Email team leads</strong>
                      <small>Control report due emails in addition to in-portal reminders.</small>
                    </span>
                  </label>
                  <div className="hq-inline-grid">
                    <div className="field"><label className="label" htmlFor="report-reminder-one">Reminder 1</label><input className="input" id="report-reminder-one" name="report_reminder_day_one" type="number" min="1" max="365" defaultValue={reportReminderDays[0] || ''} /></div>
                    <div className="field"><label className="label" htmlFor="report-reminder-two">Reminder 2</label><input className="input" id="report-reminder-two" name="report_reminder_day_two" type="number" min="1" max="365" defaultValue={reportReminderDays[1] || ''} /></div>
                  </div>
                  <div className="field"><label className="label" htmlFor="report-reminder-three">Reminder 3</label><input className="input" id="report-reminder-three" name="report_reminder_day_three" type="number" min="1" max="365" defaultValue={reportReminderDays[2] || ''} /></div>
                  <div className="button-row"><button className="button" type="submit">Save report reminders</button></div>
                </form>
              ) : (
                <div className="hq-summary-list">
                  <div className="hq-summary-row"><span>Email reminders</span><strong>{reportNotificationSettings?.email_enabled ?? true ? 'Enabled' : 'Disabled'}</strong></div>
                  <div className="hq-summary-row"><span>Reminder cadence</span><strong>{reportReminderDays.map((day) => `${day} days before`).join(', ')}</strong></div>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {tab === 'reporting' ? (
          <div className="hq-lead-grid">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Academic cycle</h3>
              </div>
              {canEdit ? (
                <form action={updateAcademicCalendarSettingsAction} className="form-stack">
                  <div className="hq-inline-grid">
                    <div className="field"><label className="label" htmlFor="autumn-start">Autumn start</label><input className="input" id="autumn-start" name="autumn_start_md" placeholder="09-22" defaultValue={calendarTemplate.autumnStartMonthDay} required /></div>
                    <div className="field"><label className="label" htmlFor="autumn-end">Autumn end</label><input className="input" id="autumn-end" name="autumn_end_md" placeholder="12-12" defaultValue={calendarTemplate.autumnEndMonthDay} required /></div>
                    <div className="field"><label className="label" htmlFor="winter-end">Winter end</label><input className="input" id="winter-end" name="winter_end_md" placeholder="03-20" defaultValue={calendarTemplate.winterEndMonthDay} required /></div>
                    <div className="field"><label className="label" htmlFor="spring-end">Spring end</label><input className="input" id="spring-end" name="spring_end_md" placeholder="06-10" defaultValue={calendarTemplate.springEndMonthDay} required /></div>
                    <div className="field"><label className="label" htmlFor="summer-end">Summer end</label><input className="input" id="summer-end" name="summer_end_md" placeholder="08-15" defaultValue={calendarTemplate.summerEndMonthDay} required /></div>
                  </div>
                  <span className="helper">Use MM-DD. Winter, spring, and summer each start the day after the previous quarter ends. The academic cycle auto-advances the day after summer quarter ends.</span>
                  <div className="hq-summary-list">
                    {reportingWindows.map((window) => (
                      <div key={window.quarter} className="hq-summary-row">
                        <span>{window.quarter} preview</span>
                        <strong>{formatDateLabel(window.start)} to {formatDateLabel(window.end)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="button-row"><button className="button" type="submit">Save academic calendar</button></div>
                </form>
              ) : (
                <div className="hq-summary-list">
                  <div className="hq-summary-row"><span>Current cycle</span><strong>{currentAcademicYear}</strong></div>
                  {reportingWindows.map((window) => (
                    <div key={window.quarter} className="hq-summary-row">
                      <span>{window.quarter}</span>
                      <strong>{formatDateLabel(window.start)} to {formatDateLabel(window.end)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Quarterly report questions</h3>
              </div>
              <ReportQuestionEditor initialQuestions={reportQuestions} readOnly={!canEdit} />
            </section>
          </div>
        ) : null}

        {tab === 'audit' ? (
          <section className="hq-lead-block">
            <div className="hq-block-head">
              <h3>Recent audit log</h3>
            </div>
            <div className="hq-audit-list">
              {auditEntries.length > 0 ? auditEntries.map((entry) => (
                <div key={entry.id} className="hq-audit-row">
                  <div className="hq-audit-main">
                    <strong>{entry.summary}</strong>
                    <span>{entry.actor_id ? actorNameMap.get(entry.actor_id) || 'Unknown user' : 'System'} · {entry.action} · {entry.target_type}</span>
                  </div>
                  <time dateTime={entry.created_at}>{formatAuditTimestamp(entry.created_at)}</time>
                </div>
              )) : <p className="empty-note">Audit events will appear here as club data changes.</p>}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}
