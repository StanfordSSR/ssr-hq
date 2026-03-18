import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'team_lead';
  active: boolean;
};

type Team = {
  id: string;
  name: string;
};

type Membership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
};

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
  const myTeamIds = new Set(
    memberships
      .filter((membership) => membership.user_id === user.id && membership.team_role === 'lead')
      .map((membership) => membership.team_id)
  );

  const visibleMemberships = isAdmin
    ? memberships
    : memberships.filter((membership) => myTeamIds.has(membership.team_id));

  const visibleUserIds = new Set(visibleMemberships.map((membership) => membership.user_id));
  if (isAdmin) {
    for (const profile of profiles) {
      visibleUserIds.add(profile.id);
    }
  }

  const visibleProfiles = profiles.filter((profile) => visibleUserIds.has(profile.id));

  const teamNamesByUser = new Map<string, string[]>();
  for (const membership of visibleMemberships) {
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
          <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'Lead portal'}</p>
          <h1 className="hq-page-title">{isAdmin ? 'Manage members' : 'Team members'}</h1>
          <p className="hq-subtitle">
            {isAdmin
              ? 'View all admins and leads, plus each person’s role and associated team assignments.'
              : 'View the active people currently tied to your team workspace.'}
          </p>
        </div>
      </section>

      <section className="hq-panel">
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
              {visibleProfiles.map((profile) => {
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
