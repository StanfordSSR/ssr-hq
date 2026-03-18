import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { addTeamRosterMemberAction } from '@/app/dashboard/actions';

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'team_lead';
  active: boolean;
};

type Team = {
  id: string;
  name: string;
  logo_url: string | null;
};

type Membership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
};

type RosterMember = {
  id: string;
  team_id: string;
  full_name: string;
  stanford_email: string;
  joined_month: number;
  joined_year: number;
};

const monthOptions = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

export default async function ManageMembersPage() {
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
    .select('id, full_name, role, active')
    .eq('id', user.id)
    .single<Profile>();

  if (!me?.active) {
    redirect('/login');
  }

  const isAdmin = me.role === 'admin';

  if (isAdmin) {
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, role, active')
      .order('role')
      .order('full_name');

    const profiles = (profilesData || []) as Profile[];

    const { data: teamsData } = await supabase.from('teams').select('id, name').order('name');
    const teams = (teamsData || []) as Team[];
    const teamMap = new Map(teams.map((team) => [team.id, team.name]));

    const { data: membershipsData } = await supabase
      .from('team_memberships')
      .select('id, team_id, user_id, team_role, is_active')
      .eq('is_active', true);

    const memberships = (membershipsData || []) as Membership[];
    const teamNamesByUser = new Map<string, string[]>();
    for (const membership of memberships) {
      const teamName = teamMap.get(membership.team_id);
      if (!teamName) continue;
      if (!teamNamesByUser.has(membership.user_id)) {
        teamNamesByUser.set(membership.user_id, []);
      }
      teamNamesByUser.get(membership.user_id)!.push(teamName);
    }

    const { data: authUsers } = await admin.auth.admin.listUsers();
    const emailMap = new Map<string, string>();
    for (const authUser of authUsers.users) {
      emailMap.set(authUser.id, authUser.email || '');
    }

    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">Admin</p>
            <h1 className="hq-page-title">Manage members</h1>
            <p className="hq-subtitle">
              View all admins and leads, plus each person&apos;s role and associated team assignments.
            </p>
          </div>
        </section>

        <section className="hq-panel hq-surface-muted">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Portal role</th>
                  <th>Associated teams</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const teamsForUser = teamNamesByUser.get(profile.id) || [];
                  return (
                    <tr key={profile.id}>
                      <td style={{ fontWeight: 700 }}>{profile.full_name || 'Unnamed user'}</td>
                      <td>{emailMap.get(profile.id) || 'No email found'}</td>
                      <td>
                        <span className={`badge ${profile.role === 'admin' ? 'badge-admin' : 'badge-team'}`}>
                          {profile.role === 'admin' ? 'Admin' : 'Lead'}
                        </span>
                      </td>
                      <td>{teamsForUser.length > 0 ? teamsForUser.join(', ') : 'None'}</td>
                      <td>
                        <span className={`badge ${profile.active ? 'badge-team' : 'badge-off'}`}>
                          {profile.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  const { data: leadMembershipsData } = await admin
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const leadMemberships = (leadMembershipsData || []) as Membership[];
  const primaryTeamId = leadMemberships[0]?.team_id;

  if (!primaryTeamId) {
    redirect('/dashboard');
  }

  const { data: team } = await admin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', primaryTeamId)
    .single<Team>();

  const { data: rosterData } = await admin
    .from('team_roster_members')
    .select('id, team_id, full_name, stanford_email, joined_month, joined_year')
    .eq('team_id', primaryTeamId)
    .order('joined_year', { ascending: false })
    .order('joined_month', { ascending: false })
    .order('full_name');

  const rosterMembers = (rosterData || []) as RosterMember[];
  const totalCount = leadMemberships.length + rosterMembers.length;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Lead portal</p>
          <h1 className="hq-page-title">Team members</h1>
          <p className="hq-subtitle">Maintain a clean roster for your team even when members do not have HQ accounts.</p>
        </div>
      </section>

      <div className="hq-lead-dashboard">
        <aside className="hq-panel hq-lead-sidebar hq-surface-muted">
          <div className="hq-section-head">
            <div className="hq-section-head-copy">
              <p className="hq-eyebrow">Roster</p>
              <div className="hq-team-title-row">
                {team?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-large" />
                ) : (
                  <div className="hq-team-logo hq-team-logo-large hq-team-logo-fallback">
                    {team?.name.slice(0, 1) || 'T'}
                  </div>
                )}
                <h2 className="hq-section-title hq-section-title-compact">{team?.name || 'Your team'}</h2>
              </div>
            </div>
          </div>

          <div className="hq-summary-list">
            <div className="hq-summary-row">
              <span>Total people tracked</span>
              <strong>{totalCount}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Lead accounts</span>
              <strong>{leadMemberships.length}</strong>
            </div>
            <div className="hq-summary-row">
              <span>Recorded members</span>
              <strong>{rosterMembers.length}</strong>
            </div>
          </div>
        </aside>

        <section className="hq-panel hq-lead-main hq-surface-muted">
          <div className="hq-lead-grid">
            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Add member</h3>
              </div>

              <form action={addTeamRosterMemberAction} className="form-stack">
                <input type="hidden" name="team_id" value={primaryTeamId} />
                <div className="field">
                  <label className="label" htmlFor="member-full-name">
                    Full name
                  </label>
                  <input className="input" id="member-full-name" name="full_name" required />
                </div>

                <div className="field">
                  <label className="label" htmlFor="member-email">
                    Stanford email
                  </label>
                  <input className="input" id="member-email" name="stanford_email" type="email" placeholder="sunet@stanford.edu" required />
                </div>

                <div className="hq-inline-grid">
                  <div className="field">
                    <label className="label" htmlFor="joined-month">
                      Joined month
                    </label>
                    <select className="select" id="joined-month" name="joined_month" defaultValue={String(new Date().getMonth() + 1)}>
                      {monthOptions.map((month, index) => (
                        <option key={month} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="joined-year">
                      Joined year
                    </label>
                    <input className="input" id="joined-year" name="joined_year" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()} required />
                  </div>
                </div>

                <div className="button-row">
                  <button className="button" type="submit">
                    Add member
                  </button>
                </div>
              </form>
            </section>

            <section className="hq-lead-block">
              <div className="hq-block-head">
                <h3>Recorded members</h3>
              </div>

              {rosterMembers.length > 0 ? (
                <div className="hq-summary-list">
                  {rosterMembers.map((member) => (
                    <div key={member.id} className="hq-summary-row">
                      <span>
                        {monthOptions[member.joined_month - 1]} {member.joined_year}
                      </span>
                      <strong>{member.full_name}</strong>
                      <strong>{member.stanford_email}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-note">No recorded members yet.</p>
              )}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}
