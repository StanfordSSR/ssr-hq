import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState, formatDateLabel } from '@/lib/academic-calendar';
import { createTaskAction, deleteTaskAction } from '@/app/dashboard/actions';
import { ReceiptUploadForm } from '@/components/receipt-upload-form';
import { getReceiptTaskState } from '@/lib/purchases';

type Team = {
  id: string;
  name: string;
};

type Task = {
  id: string;
  title: string;
  details: string | null;
  recipient_scope: 'all_teams' | 'specific_teams';
  push_notification: boolean;
  created_at: string;
};

type TaskRecipient = {
  task_id: string;
  team_id: string;
};

type ReceiptPurchase = {
  id: string;
  team_id: string;
  description: string;
  amount_cents: number;
  purchased_at: string;
  payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  receipt_path: string | null;
  receipt_not_needed: boolean;
};

export default async function TasksPage() {
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

  if (!me?.active) {
    redirect('/login');
  }

  const isAdmin = me.role === 'admin';
  const isPresident = me.role === 'president';
  const isPrivilegedViewer = isAdmin || isPresident;
  const reportState = await getNextReportState(new Date());

  const { data: teamsData } = await admin.from('teams').select('id, name').order('name');
  const teams = (teamsData || []) as Team[];

  const { data: tasksData } = await admin
    .from('tasks')
    .select('id, title, details, recipient_scope, push_notification, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  const tasks = (tasksData || []) as Task[];

  const { data: recipientsData } = await admin.from('task_recipients').select('task_id, team_id');
  const recipients = (recipientsData || []) as TaskRecipient[];
  const recipientMap = new Map<string, string[]>();
  for (const recipient of recipients) {
    if (!recipientMap.has(recipient.task_id)) {
      recipientMap.set(recipient.task_id, []);
    }
    recipientMap.get(recipient.task_id)!.push(recipient.team_id);
  }

  let visibleTasks = tasks;
  let selectableTeams = teams;
  let pendingReceipts: ReceiptPurchase[] = [];

  if (!isPrivilegedViewer) {
    const { data: myMemberships } = await admin
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('team_role', 'lead')
      .eq('is_active', true);

    const myTeamIds = new Set((myMemberships || []).map((membership) => membership.team_id));
    selectableTeams = teams.filter((team) => myTeamIds.has(team.id));
    visibleTasks = tasks.filter((task) => {
      if (task.recipient_scope === 'all_teams') return true;
      const taskTeamIds = recipientMap.get(task.id) || [];
      return taskTeamIds.some((teamId) => myTeamIds.has(teamId));
    });

    const { data: pendingReceiptsData } = await admin
      .from('purchase_logs')
      .select('id, team_id, description, amount_cents, purchased_at, payment_method, receipt_path, receipt_not_needed')
      .in('team_id', Array.from(myTeamIds))
      .eq('payment_method', 'credit_card')
      .eq('receipt_not_needed', false)
      .is('receipt_path', null)
      .order('purchased_at', { ascending: true });

    pendingReceipts = (pendingReceiptsData || []) as ReceiptPurchase[];
  }

  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{isAdmin ? 'Admin' : isPresident ? 'President' : 'Lead portal'}</p>
          <h1 className="hq-page-title">{isAdmin ? 'Assign tasks' : 'Tasks'}</h1>
          <p className="hq-subtitle">
            {isAdmin
              ? 'Create work items for one team, several teams, or the entire club.'
              : isPresident
                ? 'Review active tasks assigned across the club.'
              : 'See active tasks assigned to your team and the current reporting window.'}
          </p>
        </div>
      </section>

      <div className={isPrivilegedViewer ? 'hq-lead-grid' : 'hq-task-layout'}>
        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>{isAdmin ? 'Create task' : isPresident ? 'Task overview' : 'Reporting window'}</h3>
          </div>

          {isAdmin ? (
            <form action={createTaskAction} className="form-stack">
              <div className="field">
                <label className="label" htmlFor="task-title">
                  Task title
                </label>
                <input className="input" id="task-title" name="title" placeholder="Quarterly report draft, safety checklist, budget follow-up..." required />
              </div>

              <div className="field">
                <label className="label" htmlFor="task-details">
                  Details
                </label>
                <textarea className="input hq-textarea" id="task-details" name="details" rows={4} />
              </div>

              <div className="field">
                <label className="label" htmlFor="recipient-scope">
                  Recipients
                </label>
                <select className="select" id="recipient-scope" name="recipient_scope" defaultValue="specific_teams">
                  <option value="specific_teams">Specific teams</option>
                  <option value="all_teams">All teams</option>
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="team-ids">
                  Specific teams
                </label>
                <select className="select hq-multiselect" id="team-ids" name="team_ids" multiple size={Math.min(6, Math.max(3, selectableTeams.length))}>
                  {selectableTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <span className="helper">Use Command/Ctrl-click to select multiple teams.</span>
              </div>

              <label className="hq-switch">
                <input type="checkbox" name="push_notification" />
                <span className="hq-switch-track" aria-hidden="true" />
                <span className="hq-switch-copy">
                  <strong>Push notification</strong>
                  <small>Marks the task as a notification request for recipients.</small>
                </span>
              </label>

              <div className="button-row">
                <button className="button" type="submit">
                  Assign task
                </button>
              </div>
            </form>
          ) : isPresident ? (
            <div className="hq-report-card">
              <strong>Read-only access</strong>
              <span>Presidents can view all assigned tasks but cannot create or remove them.</span>
            </div>
          ) : (
            <div className="hq-report-card">
              <strong>{reportState.targetQuarter}</strong>
              <span>{reportState.message}</span>
              <p>
                {reportState.reportState === 'open'
                  ? `Submit by ${formatDateLabel(reportState.dueAt)}.`
                  : `Submission opens on ${formatDateLabel(reportState.openAt)}.`}
              </p>
              {reportState.reportState === 'open' ? (
                <div className="button-row">
                  <Link href="/dashboard/reports" className="button">
                    Open report
                  </Link>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>{isPrivilegedViewer ? 'Assigned tasks' : 'Team tasks'}</h3>
          </div>

          {isPrivilegedViewer ? (
            visibleTasks.length > 0 ? (
              <div className="hq-summary-list">
                {visibleTasks.map((task) => {
                  const teamNames =
                    task.recipient_scope === 'all_teams'
                      ? ['All teams']
                      : (recipientMap.get(task.id) || []).map((teamId) => teamNameMap.get(teamId) || 'Unknown team');

                  return (
                    <div key={task.id} className="hq-summary-row">
                      <span>{teamNames.join(', ')}</span>
                      <strong>{task.title}</strong>
                      <strong>{task.details || 'No extra details yet.'}</strong>
                      {isAdmin ? (
                        <div className="hq-inline-editor-actions">
                          <form action={deleteTaskAction}>
                            <input type="hidden" name="task_id" value={task.id} />
                            <button className="button-secondary" type="submit">
                              Delete task
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-note">No tasks have been assigned yet.</p>
            )
          ) : (
            <div className="hq-task-stack">
              {pendingReceipts.map((purchase) => {
                const receiptState = getReceiptTaskState({
                  paymentMethod: purchase.payment_method,
                  purchasedAt: purchase.purchased_at,
                  receiptPath: purchase.receipt_path,
                  receiptNotNeeded: purchase.receipt_not_needed
                });

                return (
                  <article
                    key={`receipt-${purchase.id}`}
                    className={`hq-task-card hq-task-card-receipt ${receiptState.overdue ? 'hq-task-card-alert' : ''}`}
                  >
                    <div className="hq-task-card-head">
                      <div>
                        <span className="hq-task-kicker">Receipt task</span>
                        <h4>Upload receipt for {purchase.description}</h4>
                      </div>
                      {receiptState.overdue ? <strong className="hq-task-alert">OVERDUE</strong> : null}
                    </div>

                    <div className="hq-task-card-meta">
                      <span>{teamNameMap.get(purchase.team_id) || 'Unknown team'}</span>
                      <span>{formatDateLabel(new Date(purchase.purchased_at))}</span>
                      <span>${(purchase.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>

                    <p>
                      {receiptState.overdue
                        ? `This receipt is ${receiptState.ageDays} days old and needs immediate attention.`
                        : 'Upload the receipt now to keep your team purchase log complete.'}
                    </p>

                    <ReceiptUploadForm purchaseId={purchase.id} compact />
                  </article>
                );
              })}

              {visibleTasks.map((task) => {
                const teamNames =
                  task.recipient_scope === 'all_teams'
                    ? ['All teams']
                    : (recipientMap.get(task.id) || []).map((teamId) => teamNameMap.get(teamId) || 'Unknown team');

                return (
                  <article key={task.id} className="hq-task-card">
                    <div className="hq-task-card-head">
                      <div>
                        <span className="hq-task-kicker">Assigned task</span>
                        <h4>{task.title}</h4>
                      </div>
                    </div>
                    <div className="hq-task-card-meta">
                      <span>{teamNames.join(', ')}</span>
                      <span>{formatDateLabel(new Date(task.created_at))}</span>
                    </div>
                    <p>{task.details || 'No extra details yet.'}</p>
                  </article>
                );
              })}

              {pendingReceipts.length === 0 && visibleTasks.length === 0 ? (
                <p className="empty-note">No tasks are assigned to your team yet.</p>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
