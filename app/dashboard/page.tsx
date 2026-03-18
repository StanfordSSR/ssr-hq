import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { getNextReportState, formatAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { updateLeadTeamDescriptionAction } from '@/app/dashboard/teams/actions';

type Team = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

type Membership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
};

const adminCards = [
  {
    href: '/dashboard/teams',
    title: 'Manage teams',
    description: 'Create teams, assign leads, and manage club structure.'
  },
  {
    href: '/dashboard/members',
    title: 'Manage members',
    description: 'Review admins and team leads across the club.'
  }
];

export default async function DashboardPage() {
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

  const isAdmin = me.role === 'admin';

  if (isAdmin) {
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, description, is_active, created_at')
      .eq('is_active', true)
      .order('name');

    const { data: membershipsData } = await supabase
      .from('team_memberships')
      .select('id, team_id, user_id, team_role, is_active')
      .eq('is_active', true);

    const teams = (teamsData || []) as Team[];
    const memberships = (membershipsData || []) as Membership[];
    const activeLeadMemberships = memberships.filter((membership) => membership.team_role === 'lead');

    return (
      <div className="hq-page">
        <section className="hq-hero">
          <div>
            <p className="hq-eyebrow">Admin portal</p>
            <h1 className="hq-title">Welcome back, {me.full_name || 'operator'}.</h1>
            <p className="hq-subtitle">
              Use HQ to manage teams, leads, members, and the club&apos;s operating structure.
            </p>
          </div>

          <div className="hq-mini-stats">
            <div className="hq-mini-stat">
              <strong>{teams.length}</strong>
              <span>active teams</span>
            </div>
            <div className="hq-mini-stat">
              <strong>{activeLeadMemberships.length}</strong>
              <span>lead assignments</span>
            </div>
            <div className="hq-mini-stat">
              <strong>{formatAcademicYear(new Date())}</strong>
              <span>current cycle</span>
            </div>
          </div>
        </section>

        <section className="hq-admin-grid">
          {adminCards.map((card) => (
            <Link href={card.href} key={card.href} className="hq-admin-link">
              <strong>{card.title}</strong>
              <span>{card.description}</span>
            </Link>
          ))}
        </section>
      </div>
    );
  }

  const { data: membershipsData } = await supabase
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('is_active', true)
    .eq('user_id', user.id)
    .eq('team_role', 'lead');

  const myMemberships = (membershipsData || []) as Membership[];
  const primaryTeamId = myMemberships[0]?.team_id;

  if (!primaryTeamId) {
    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Lead portal</p>
            <h1 className="hq-page-title">Dashboard</h1>
            <p className="hq-subtitle">You do not have an active team assignment yet.</p>
          </div>
        </section>
      </div>
    );
  }

  const { data: team } = await supabase
    .from('teams')
    .select('id, name, description, is_active, created_at')
    .eq('id', primaryTeamId)
    .single<Team>();

  if (!team) {
    redirect('/login');
  }

  const { data: teamMembershipsData } = await supabase
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('team_id', primaryTeamId)
    .eq('is_active', true);

  const teamMemberships = (teamMembershipsData || []) as Membership[];
  const memberCount = teamMemberships.length;
  const reportState = getNextReportState(new Date());
  const annualBudget = 0;
  const spent = 0;
  const spentPercent = annualBudget > 0 ? Math.min(100, Math.round((spent / annualBudget) * 100)) : 0;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Dashboard</h1>
          <p className="hq-subtitle">
            Stay on top of team health, reporting windows, and spending for {team.name}.
          </p>
        </div>
      </section>

      <div className="hq-lead-dashboard">
        <aside className="hq-panel hq-lead-sidebar">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team summary</p>
              <h2 className="hq-section-title hq-section-title-compact">{team.name}</h2>
            </div>
          </div>

          <div className="hq-summary-list">
            <div className="hq-summary-row">
              <span>Description</span>
              <strong>{team.description || 'No description added yet.'}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Members</span>
              <strong>{memberCount}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Date created</span>
              <strong>{formatDateLabel(new Date(team.created_at))}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Status</span>
              <strong>{team.is_active ? 'Active' : 'Inactive'}</strong>
            </div>
          </div>

          <form action={updateLeadTeamDescriptionAction} className="form-stack hq-compact-form">
            <input type="hidden" name="team_id" value={team.id} />
            <div className="field">
              <label className="label" htmlFor="lead-team-description">
                Edit description
              </label>
              <textarea
                className="input hq-textarea"
                id="lead-team-description"
                name="description"
                maxLength={300}
                defaultValue={team.description || ''}
                placeholder="Summarize what your team is building this year."
                rows={5}
              />
              <span className="helper">Maximum 300 characters.</span>
            </div>

            <div className="button-row">
              <button className="button" type="submit">
                Save description
              </button>
            </div>
          </form>
        </aside>

        <section className="hq-panel hq-lead-main">
          <div className="hq-lead-overview">
            <div className="hq-lead-overview-copy">
              <p className="hq-eyebrow">Operations</p>
              <h2 className="hq-section-title hq-section-title-compact">Annual summary</h2>
              <p className="hq-subtitle">
                A quick snapshot of cycle timing, reporting readiness, and spending.
              </p>
            </div>

            <div className="hq-budget-ring-wrap">
              <div
                className="hq-budget-ring"
                style={{ '--budget-fill': `${spentPercent}%` } as CSSProperties}
              >
                <div className="hq-budget-ring-inner">
                  <strong>{spentPercent}%</strong>
                  <span>spent</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hq-lead-metrics">
            <div className="hq-lead-metric">
              <span>Annual cycle</span>
              <strong>{reportState.academicYear}</strong>
            </div>
            <div className="hq-lead-metric">
              <span>Total budget</span>
              <strong>${annualBudget.toLocaleString()}</strong>
            </div>
            <div className="hq-lead-metric">
              <span>Spent so far</span>
              <strong>${spent.toLocaleString()}</strong>
            </div>
          </div>

          <div className="hq-lead-grid">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Tasks</h3>
                <Link href="/dashboard/tasks" className="hq-inline-link">
                  Open tasks
                </Link>
              </div>
              <p className="empty-note">No tasks yet.</p>
            </section>

            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Next report due</h3>
                <span
                  className={`hq-status-chip hq-status-${reportState.reportState === 'open' ? 'open' : 'pending'}`}
                >
                  {reportState.reportState === 'open' ? 'Open now' : 'Not open yet'}
                </span>
              </div>

              <div className="hq-report-card">
                <strong>{reportState.targetQuarter}</strong>
                <span>{reportState.message}</span>
                <p>{reportState.reportState === 'open' ? `Deadline in ${reportState.countdownLabel}.` : `${reportState.countdownLabel} until reporting opens.`}</p>
              </div>
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
