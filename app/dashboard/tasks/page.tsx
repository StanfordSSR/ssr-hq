import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState, formatDateLabel } from '@/lib/academic-calendar';
import { createTaskAction } from '@/app/dashboard/actions';

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
  const reportState = getNextReportState(new Date());

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

  if (!isAdmin) {
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
  }

  const teamNameMap = new Map(teams.map((team) => [team.id, team.name]));

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'Lead portal'}</p>
          <h1 className="hq-page-title">{isAdmin ? 'Assign tasks' : 'Tasks'}</h1>
          <p className="hq-subtitle">
            {isAdmin
              ? 'Create work items for one team, several teams, or the entire club.'
              : 'See active tasks assigned to your team and the current reporting window.'}
          </p>
        </div>
      </section>

      <div className="hq-lead-grid">
        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>{isAdmin ? 'Create task' : 'Reporting window'}</h3>
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
          ) : (
            <div className="hq-report-card">
              <strong>{reportState.targetQuarter}</strong>
              <span>{reportState.message}</span>
              <p>
                {reportState.reportState === 'open'
                  ? `Submit by ${formatDateLabel(reportState.dueAt)}.`
                  : `Submission opens on ${formatDateLabel(reportState.openAt)}.`}
              </p>
            </div>
          )}
        </section>

        <section className="hq-panel hq-lead-block">
          <div className="hq-block-head">
            <h3>{isAdmin ? 'Assigned tasks' : 'Your tasks'}</h3>
          </div>

          {visibleTasks.length > 0 ? (
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
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="empty-note">{isAdmin ? 'No tasks have been assigned yet.' : 'No tasks are assigned to your team yet.'}</p>
          )}
        </section>
      </div>
    </div>
  );
}
