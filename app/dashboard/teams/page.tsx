import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  assignExistingLeadAction,
  createTeamAction,
  removeLeadFromTeamAction,
  updateLeadTeamDescriptionAction
} from '@/app/dashboard/teams/actions';
import { invitePortalMemberAction } from '@/app/dashboard/actions';
import { getViewerContext } from '@/lib/auth';

type Team = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
};

type Membership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
};

type Profile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: 'admin' | 'president' | 'team_lead';
  is_admin?: boolean | null;
  is_president?: boolean | null;
  active: boolean;
};

export default async function ManageTeamsPage() {
  const admin = createAdminClient();
  const { currentRole } = await getViewerContext();

  if (currentRole !== 'admin' && currentRole !== 'president') {
    redirect('/dashboard');
  }
  const canEdit = currentRole === 'admin';

  const { data: teamsData } = await admin
    .from('teams')
    .select('id, name, slug, description, logo_url, is_active')
    .order('name');

  const teams = (teamsData || []) as Team[];

  const { data: membershipsData } = await admin
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('is_active', true)
    .order('created_at');

  const memberships = (membershipsData || []) as Membership[];

  const { data: profilesData } = await admin
    .from('profiles')
    .select('id, full_name, email, role, is_admin, is_president, active')
    .order('full_name');

  const profiles = (profilesData || []) as Profile[];
  const leadProfiles = profiles.filter((profile) => profile.active);
  const activeLeadMemberships = memberships.filter(
    (membership) => membership.team_role === 'lead' && membership.is_active
  );
  const assignedLeadIds = new Set(activeLeadMemberships.map((membership) => membership.user_id));
  const unassignedLeadProfiles = leadProfiles.filter((profile) => !assignedLeadIds.has(profile.id));

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const captchaLeft = Math.floor(Math.random() * 5) + 4;
  const captchaRight = Math.floor(Math.random() * 5) + 3;
  const leadsByTeam = new Map<
    string,
    Array<{
      membershipId: string;
      userId: string;
      fullName: string | null;
      email: string;
    }>
  >();

  for (const membership of memberships) {
    if (membership.team_role !== 'lead') continue;
    const profile = profileMap.get(membership.user_id);
    if (!profile) continue;

    if (!leadsByTeam.has(membership.team_id)) {
      leadsByTeam.set(membership.team_id, []);
    }

    leadsByTeam.get(membership.team_id)!.push({
      membershipId: membership.id,
      userId: membership.user_id,
      fullName: profile.full_name,
      email: profile.email || ''
    });
  }

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : 'President'}</p>
          <h1 className="hq-page-title">Manage teams</h1>
          <p className="hq-subtitle">
            {canEdit
              ? 'Create teams, assign leads, and manage the team structure of Stanford Student Robotics.'
              : 'Review teams, lead assignments, and team structure across Stanford Student Robotics.'}
          </p>
        </div>

        {canEdit ? <div className="hq-page-head-action">
          <a href="#add-team" className="button">
            Add team
          </a>
        </div> : null}
      </section>

      <div className="hq-teams-layout">
        <section className="hq-panel hq-teams-panel">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Team directory</p>
              <h2 className="hq-section-title hq-section-title-compact">All teams</h2>
            </div>
            <p className="hq-teams-count">{teams.length} total</p>
          </div>

          <div className="hq-team-list">
            {teams.map((team) => {
              const leads = leadsByTeam.get(team.id) || [];
              const assignableLeads = unassignedLeadProfiles.filter(
                (profile) => !leads.some((lead) => lead.userId === profile.id)
              );

              return (
                <article key={team.id} className="hq-team-row">
                  <div className="hq-team-row-head">
                    <div className="hq-team-heading">
                      <div className="hq-team-title-row">
                        {team.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-medium" />
                        ) : (
                          <div className="hq-team-logo hq-team-logo-medium hq-team-logo-fallback">
                            {team.name.slice(0, 1)}
                          </div>
                        )}
                        <h3>{team.name}</h3>
                      </div>
                      <p>{team.description || team.slug}</p>
                    </div>

                    <span className={`badge ${team.is_active ? 'badge-team' : 'badge-off'}`}>
                      {team.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="hq-team-row-body">
                    <section className="hq-team-column">
                      <h4 className="hq-team-label">Current leads</h4>

                      {leads.length > 0 ? (
                        <div className="hq-team-lead-list">
                          {leads.map((lead) => (
                            <div key={lead.membershipId} className="hq-team-lead-item">
                              <div>
                                <strong>{lead.fullName || 'Unnamed lead'}</strong>
                                <span>{lead.email || 'No email found'}</span>
                              </div>

                              {canEdit ? (
                                <form action={removeLeadFromTeamAction}>
                                  <input type="hidden" name="membership_id" value={lead.membershipId} />
                                  <button className="button-ghost" type="submit">
                                    Remove
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-note">No active leads assigned.</p>
                      )}
                    </section>

                    {canEdit ? <section className="hq-team-column hq-team-column-form">
                      <h4 className="hq-team-label">Assign existing lead</h4>
                      <form action={assignExistingLeadAction} className="hq-team-assign-form">
                        <input type="hidden" name="team_id" value={team.id} />

                        <select
                          className="select"
                          name="user_id"
                          defaultValue=""
                          required
                          disabled={assignableLeads.length === 0}
                        >
                          <option value="" disabled>
                            {assignableLeads.length > 0
                              ? 'Select an unassigned lead'
                              : 'No unassigned leads available'}
                          </option>
                          {assignableLeads.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.full_name || profile.email || profile.id.slice(0, 8)}
                              {profile.email ? ` · ${profile.email}` : ''}
                            </option>
                          ))}
                        </select>

                        <button className="button" type="submit" disabled={assignableLeads.length === 0}>
                          Assign
                        </button>
                      </form>

                      <div className="hq-team-form-divider" />

                      <h4 className="hq-team-label">Team branding</h4>
                      <form action={updateLeadTeamDescriptionAction} className="form-stack">
                        <input type="hidden" name="team_id" value={team.id} />
                        <div className="field">
                          <label className="label" htmlFor={`team-logo-${team.id}`}>
                            Logo URL
                          </label>
                          <input
                            className="input"
                            id={`team-logo-${team.id}`}
                            name="logo_url"
                            defaultValue={team.logo_url || ''}
                            placeholder="https://example.com/team-logo.png"
                          />
                        </div>
                        <div className="field">
                          <label className="label" htmlFor={`team-description-${team.id}`}>
                            Description
                          </label>
                          <textarea
                            className="input hq-textarea"
                            id={`team-description-${team.id}`}
                            name="description"
                            defaultValue={team.description || ''}
                            maxLength={300}
                            rows={4}
                          />
                        </div>
                        <button className="button-secondary" type="submit">
                          Save profile
                        </button>
                      </form>
                    </section> : null}
                  </div>
                </article>
              );
            })}

            {teams.length === 0 ? (
              <div className="hq-empty-card">
                <h3>No teams yet</h3>
                <p>Create your first team from the panel on the right.</p>
              </div>
            ) : null}
          </div>
        </section>

        {canEdit ? <aside id="add-team" className="hq-panel hq-sticky-panel hq-teams-side-panel">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Create</p>
              <h2 className="hq-section-title hq-section-title-compact">Add team</h2>
            </div>
          </div>

          <form action={createTeamAction} className="form-stack">
            <input type="hidden" name="captcha_left" value={captchaLeft} />
            <input type="hidden" name="captcha_right" value={captchaRight} />

            <div className="field">
              <label className="label" htmlFor="name">
                Team name
              </label>
              <input className="input" id="name" name="name" placeholder="SkyRunners" required />
            </div>

            <div className="field">
              <label className="label" htmlFor="description">
                Description
              </label>
              <input
                className="input"
                id="description"
                name="description"
                maxLength={300}
                placeholder="Fixed-wing UAV, maritime robotics, builder systems..."
              />
              <span className="helper">Up to 300 characters.</span>
            </div>

            <div className="field">
              <label className="label" htmlFor="lead_one_id">
                Initial lead 1 (optional)
              </label>
              <select className="select" id="lead_one_id" name="lead_one_id" defaultValue="">
                <option value="">No initial lead</option>
                {leadProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email || profile.id.slice(0, 8)}
                    {profile.email ? ` · ${profile.email}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="lead_two_id">
                Initial lead 2 (optional)
              </label>
              <select className="select" id="lead_two_id" name="lead_two_id" defaultValue="">
                <option value="">No second lead</option>
                {leadProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name || profile.email || profile.id.slice(0, 8)}
                    {profile.email ? ` · ${profile.email}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <label className="hq-switch">
              <input type="checkbox" name="board_approved" required />
              <span className="hq-switch-track" aria-hidden="true" />
              <span className="hq-switch-copy">
                <strong>Board approval</strong>
                <small>This team has been approved by the board.</small>
              </span>
            </label>

            <label className="hq-switch">
              <input type="checkbox" name="truthful_ack" required />
              <span className="hq-switch-track" aria-hidden="true" />
              <span className="hq-switch-copy">
                <strong>Truthfulness confirmation</strong>
                <small>I confirm this information is truthful.</small>
              </span>
            </label>

            <div className="field">
              <label className="label" htmlFor="captcha_answer">
                Captcha
              </label>
              <input
                className="input"
                id="captcha_answer"
                name="captcha_answer"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder={`What is ${captchaLeft} + ${captchaRight}?`}
                required
              />
              <span className="helper">Solve the prompt before creating the team.</span>
            </div>

            <div className="button-row">
              <button className="button" type="submit">
                Create team
              </button>
            </div>
          </form>

          <div className="hq-team-form-divider" />

          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Invite</p>
              <h2 className="hq-section-title hq-section-title-compact">New portal lead</h2>
            </div>
          </div>

          <form action={invitePortalMemberAction} className="form-stack">
            <div className="field">
              <label className="label" htmlFor="invite-full-name">
                Full name
              </label>
              <input className="input" id="invite-full-name" name="full_name" required />
            </div>

            <div className="field">
              <label className="label" htmlFor="invite-email">
                Stanford email
              </label>
              <input
                className="input"
                id="invite-email"
                name="email"
                type="email"
                placeholder="sunet@stanford.edu"
                required
              />
            </div>

            <div className="field">
              <label className="label" htmlFor="invite-team">
                Assign to team
              </label>
              <select className="select" id="invite-team" name="team_id" defaultValue="">
                <option value="">Invite without team assignment</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <span className="helper">Inviting without a team is possible, but not recommended.</span>
            </div>

            <div className="button-row">
              <button className="button-secondary" type="submit">
                Invite lead
              </button>
            </div>
          </form>
        </aside> : null}
      </div>
    </div>
  );
}
