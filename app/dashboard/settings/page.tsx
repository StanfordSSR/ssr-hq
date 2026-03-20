import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import Link from 'next/link';
import {
  getAcademicCalendarSettings,
  getAcademicCalendarTemplate,
  getReportingWindows,
  formatDateLabel
} from '@/lib/academic-calendar';
import {
  assignFinancialOfficerRoleAction,
  assignPresidentRoleAction,
  inviteFinancialOfficerAction,
  invitePresidentAction,
  removeFinancialOfficerRoleAction,
  removePresidentRoleAction,
  updateAcademicCalendarSettingsAction,
  updateAcademicRolloverSettingsAction,
  updateReceiptNotificationSettingsAction,
  updateReportNotificationSettingsAction
} from '@/app/dashboard/actions';
import { AcademicYearInitializerForm } from '@/components/academic-year-initializer-form';
import { getReceiptNotificationSettings } from '@/lib/receipt-workflow';
import { ReportQuestionEditor } from '@/components/report-question-editor';
import { normalizeReminderDays } from '@/lib/purchases';
import { SettingsTabs } from '@/components/settings-tabs';
import {
  getRoleLabel,
  getViewerContext,
  profileHasAdminRole,
  profileHasFinancialOfficerRole,
  profileHasLeadRole,
  profileHasPresidentRole
} from '@/lib/auth';

function formatAuditTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

export default async function SettingsPage() {
  const admin = createAdminClient();
  const { currentRole } = await getViewerContext();
  if (currentRole !== 'admin' && currentRole !== 'president') {
    redirect('/dashboard');
  }

  const canEdit = currentRole === 'admin';
  const [
    calendarSettings,
    calendarTemplate,
    receiptSettings,
    reportQuestionsResponse,
    reportNotificationSettingsResponse,
    queuedNotificationsResponse,
    auditEntriesResponse,
    allProfilesResponse
  ] =
    await Promise.all([
      getAcademicCalendarSettings(),
      getAcademicCalendarTemplate(),
      getReceiptNotificationSettings(),
      admin.from('report_questions').select('id, prompt, field_type, word_limit, sort_order').eq('is_active', true).order('sort_order'),
      admin.from('report_notification_settings').select('email_enabled, reminder_days').eq('id', 1).maybeSingle(),
      admin.from('notification_queue').select('id, notification_type').eq('status', 'queued').gte('scheduled_for', new Date().toISOString()),
      admin.from('audit_log_entries').select('id, actor_id, action, target_type, target_id, summary, created_at').order('created_at', { ascending: false }).limit(40),
      admin
        .from('profiles')
        .select('id, full_name, role, is_admin, is_president, is_financial_officer, active')
        .eq('active', true)
        .order('full_name')
    ]);
  const currentAcademicYear = calendarSettings.effectiveAcademicYear;
  const nextAcademicYear = calendarSettings.nextAcademicYear;
  const [
    reportingWindows,
    currentClubBudgetData,
    currentTeamBudgetsData,
    currentPurchasesData,
    nextClubBudgetData,
    nextTeamBudgetsData
  ] = await Promise.all([
    getReportingWindows(currentAcademicYear),
    admin.from('club_budgets').select('total_budget_cents').eq('academic_year', currentAcademicYear).maybeSingle(),
    admin.from('team_budgets').select('team_id, annual_budget_cents').eq('academic_year', currentAcademicYear),
    admin.from('purchase_logs').select('amount_cents').eq('academic_year', currentAcademicYear),
    admin.from('club_budgets').select('total_budget_cents').eq('academic_year', nextAcademicYear).maybeSingle(),
    admin.from('team_budgets').select('team_id, annual_budget_cents').eq('academic_year', nextAcademicYear)
  ]);
  const reportQuestionsData = reportQuestionsResponse.data || [];
  const reportNotificationSettings = reportNotificationSettingsResponse.data;
  const queuedNotificationsData = queuedNotificationsResponse.data || [];
  const auditEntriesData = auditEntriesResponse.data || [];
  const allProfilesData = allProfilesResponse.data || [];
  const reportQuestions = reportQuestionsData.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    fieldType: question.field_type,
    wordLimit: question.word_limit
  }));
  const reportReminderDays = normalizeReminderDays(reportNotificationSettings?.reminder_days || [14, 7, 1]);
  const queuedNotifications = queuedNotificationsData || [];
  const receiptQueueCount = queuedNotifications.filter((row) => row.notification_type === 'receipt').length;
  const reportQueueCount = queuedNotifications.filter((row) => row.notification_type === 'report').length;
  const auditEntries = auditEntriesData || [];
  const actorIds = Array.from(new Set(auditEntries.map((entry) => entry.actor_id).filter(Boolean))) as string[];
  const { data: actorProfiles } = actorIds.length
    ? await admin.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] };
  const actorNameMap = new Map((actorProfiles || []).map((profile) => [profile.id, profile.full_name || 'Unknown user']));
  const allProfiles = allProfilesData || [];
  const { data: leadMemberships } = await admin
    .from('team_memberships')
    .select('user_id')
    .eq('team_role', 'lead')
    .eq('is_active', true);
  const leadUserIds = new Set((leadMemberships || []).map((membership) => membership.user_id));
  const presidents = allProfiles.filter((profile) => profileHasPresidentRole(profile));
  const presidentCandidates = allProfiles.filter((profile) => !profileHasPresidentRole(profile));
  const financialOfficers = allProfiles.filter((profile) => profileHasFinancialOfficerRole(profile));
  const financialOfficerCandidates = allProfiles.filter((profile) => !profileHasFinancialOfficerRole(profile));
  const currentBudgetInitialized = Boolean(currentClubBudgetData.data) || (currentTeamBudgetsData.data || []).length > 0;
  const nextBudgetInitialized = Boolean(nextClubBudgetData.data) || (nextTeamBudgetsData.data || []).length > 0;
  const currentAllocatedCents = (currentTeamBudgetsData.data || []).reduce(
    (sum, budget) => sum + budget.annual_budget_cents,
    0
  );
  const currentSpentCents = (currentPurchasesData.data || []).reduce(
    (sum, purchase) => sum + purchase.amount_cents,
    0
  );
  const previousReturnedCents = Math.max(0, currentAllocatedCents - currentSpentCents);
  const previousClubBudgetCents = currentClubBudgetData.data?.total_budget_cents || 0;

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
            <span>
              {currentAcademicYear}
              <br />
              {calendarSettings.autoRolloverEnabled
                ? `Auto-rollover on · date-derived ${calendarSettings.derivedAcademicYear}`
                : `Manual rollover mode · stored ${calendarSettings.storedAcademicYear}`}
            </span>
          </div>
          <div className="hq-setting-tile">
            <strong>Queued reminders</strong>
            <span>
              <Link href="/dashboard/settings/queue" className="hq-inline-link">
                {queuedNotifications.length} queued total
              </Link>
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
        <SettingsTabs
          initialTab="board"
          tabs={[
            {
              id: 'board',
              label: 'Board',
              content: (
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
                <section className="hq-lead-block">
                  <div className="hq-block-head">
                    <h3>Current financial officers</h3>
                  </div>

                  {financialOfficers.length > 0 ? (
                    <div className="hq-summary-list">
                      {financialOfficers.map((profile) => (
                        <div key={profile.id} className="hq-summary-row">
                          <span>Read-only finance oversight</span>
                          <strong>{profile.full_name || 'Unnamed user'}</strong>
                          {canEdit ? (
                            <form action={removeFinancialOfficerRoleAction}>
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
                    <p className="empty-note">No financial officers assigned yet.</p>
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
                            {profile.full_name || profile.id.slice(0, 8)} · {[
                              profileHasAdminRole(profile) ? getRoleLabel('admin') : null,
                              profileHasLeadRole(profile, leadUserIds.has(profile.id)) ? getRoleLabel('team_lead') : null
                            ].filter(Boolean).join(', ') || 'Portal user'}
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
                  <div className="hq-block-head">
                    <h3>Assign financial officer</h3>
                  </div>

                  <form action={assignFinancialOfficerRoleAction} className="form-stack">
                    <div className="field">
                      <label className="label" htmlFor="financial-officer-profile-id">
                        Portal user
                      </label>
                      <select className="select" id="financial-officer-profile-id" name="profile_id" defaultValue="">
                        <option value="" disabled>
                          Select a portal user
                        </option>
                        {financialOfficerCandidates.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.full_name || profile.id.slice(0, 8)} · {[
                              profileHasAdminRole(profile) ? getRoleLabel('admin') : null,
                              profileHasPresidentRole(profile) ? getRoleLabel('president') : null,
                              profileHasLeadRole(profile, leadUserIds.has(profile.id)) ? getRoleLabel('team_lead') : null
                            ].filter(Boolean).join(', ') || 'Portal user'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="button-row">
                      <button className="button" type="submit">
                        Assign financial officer
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

                <section className="hq-lead-block">
                  <details className="hq-compact-disclosure">
                    <summary className="hq-compact-disclosure-summary">
                      <span>Invite new financial officer</span>
                      <span className="hq-user-caret" aria-hidden="true">
                        ▾
                      </span>
                    </summary>

                    <form action={inviteFinancialOfficerAction} className="form-stack hq-compact-disclosure-body">
                      <div className="field">
                        <label className="label" htmlFor="financial-officer-full-name">
                          Full name
                        </label>
                        <input className="input" id="financial-officer-full-name" name="full_name" required />
                      </div>

                      <div className="field">
                        <label className="label" htmlFor="financial-officer-email">
                          Stanford email
                        </label>
                        <input className="input" id="financial-officer-email" name="email" type="email" required />
                      </div>

                      <div className="button-row">
                        <button className="button-secondary" type="submit">
                          Invite financial officer
                        </button>
                      </div>
                    </form>
                  </details>
                </section>
              </>
            ) : null}
          </div>
              )
            },
            {
              id: 'reminders',
              label: 'Reminders',
              content: (
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
              )
            },
            {
              id: 'continuity',
              label: 'Continuity',
              content: (
                <div className="hq-lead-grid">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Academic cycle</h3>
              </div>
              {canEdit ? (
                <div className="form-stack">
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
                      <div className="hq-summary-row">
                        <span>Rollover mode</span>
                        <strong>{calendarSettings.autoRolloverEnabled ? 'Automatic' : 'Manual'}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>Stored cycle setting</span>
                        <strong>{calendarSettings.storedAcademicYear}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>Date-derived cycle</span>
                        <strong>{calendarSettings.derivedAcademicYear}</strong>
                      </div>
                      {reportingWindows.map((window) => (
                        <div key={window.quarter} className="hq-summary-row">
                          <span>{window.quarter} preview</span>
                          <strong>{formatDateLabel(window.start)} to {formatDateLabel(window.end)}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="button-row"><button className="button" type="submit">Save academic calendar</button></div>
                  </form>

                  <form action={updateAcademicRolloverSettingsAction} className="form-stack">
                    <label className="hq-switch">
                      <input
                        type="checkbox"
                        name="auto_rollover_enabled"
                        defaultChecked={calendarSettings.autoRolloverEnabled}
                      />
                      <span className="hq-switch-track" aria-hidden="true" />
                      <span className="hq-switch-copy">
                        <strong>Auto-roll over academic year</strong>
                        <small>
                          When enabled, the portal automatically advances after summer quarter ends. When disabled,
                          admins control rollover manually.
                        </small>
                      </span>
                    </label>
                    <div className="button-row">
                      <button className="button-secondary" type="submit">
                        Save rollover setting
                      </button>
                    </div>
                  </form>

                  <div className="hq-danger-zone">
                    <div className="hq-block-head">
                      <h3>Budget year transition</h3>
                    </div>
                    <div className="hq-summary-list">
                      <div className="hq-summary-row">
                        <span>Current effective cycle</span>
                        <strong>{currentAcademicYear}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>Next cycle target</span>
                        <strong>{nextAcademicYear}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>{nextAcademicYear} setup status</span>
                        <strong>{nextBudgetInitialized ? 'Already rolled over' : 'Ready to roll over'}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>{currentAcademicYear} unused team funds</span>
                        <strong>${(previousReturnedCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="hq-summary-row">
                        <span>{currentAcademicYear} total club budget</span>
                        <strong>${(previousClubBudgetCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                    <p className="helper">
                      Rolling over preserves historical purchases and past-year spending visibility, but it starts
                      {` ${nextAcademicYear} `}with a fresh club budget at $0 and resets every active team budget to $0.
                      Prior-year leftover funds are treated as closeout only and do not carry into the next cycle.
                    </p>
                    {nextBudgetInitialized ? (
                      <p className="empty-note">
                        {nextAcademicYear} already has budget setup. Edit that year from Manage Finances instead of
                        rolling over again.
                      </p>
                    ) : (
                      <AcademicYearInitializerForm nextAcademicYear={nextAcademicYear} />
                    )}
                  </div>
                </div>
              ) : (
                <div className="hq-summary-list">
                  <div className="hq-summary-row"><span>Current cycle</span><strong>{currentAcademicYear}</strong></div>
                  <div className="hq-summary-row"><span>Rollover mode</span><strong>{calendarSettings.autoRolloverEnabled ? 'Automatic' : 'Manual'}</strong></div>
                  <div className="hq-summary-row"><span>Budget setup</span><strong>{currentBudgetInitialized ? 'Initialized' : 'Awaiting admin setup'}</strong></div>
                  {reportingWindows.map((window) => (
                    <div key={window.quarter} className="hq-summary-row">
                      <span>{window.quarter}</span>
                      <strong>{formatDateLabel(window.start)} to {formatDateLabel(window.end)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </div>
              )
            },
            {
              id: 'reporting',
              label: 'Reporting',
              content: (
                <div className="hq-lead-grid">
                  <section className="hq-lead-block">
                    <div className="hq-block-head">
                      <h3>Quarterly report questions</h3>
                    </div>
                    <ReportQuestionEditor initialQuestions={reportQuestions} readOnly={!canEdit} />
                  </section>
                </div>
              )
            },
            {
              id: 'audit',
              label: 'Audit log',
              content: (
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
              )
            }
          ]}
        />
      </section>
    </div>
  );
}
