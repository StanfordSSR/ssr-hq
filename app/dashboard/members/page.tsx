import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { invitePortalMemberAction } from '@/app/dashboard/actions';
import { AdminMemberDirectory } from '@/components/admin-member-directory';
import { LeadRosterWorkspace } from '@/components/lead-roster-workspace';
import {
  getRoleLabel,
  getViewerContext,
  profileHasAdminRole,
  profileHasFinancialOfficerRole,
  profileHasLeadRole,
  profileHasPresidentRole
} from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';

type Profile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: 'admin' | 'president' | 'financial_officer' | 'team_lead';
  is_admin?: boolean | null;
  is_president?: boolean | null;
  is_financial_officer?: boolean | null;
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
  slack_user_id?: string | null;
  joined_month: number;
  joined_year: number;
};

type LeadWorkspaceMember = {
  id: string;
  full_name: string;
  stanford_email: string;
  slack_user_id?: string | null;
  joined_month: number | null;
  joined_year: number | null;
  source: 'lead' | 'recorded';
};

type AdminMemberRow = {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  role: string;
  permissions: string;
  teams: string;
  accessLabel?: string;
  accessDetail?: string;
  sortGroup: number;
  sortName: string;
  sortJoined: number;
  canManagePassword?: boolean;
};

function formatLastSeen(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(new Date(value));
}

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
  const admin = createAdminClient();
  const { user, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isPresident = currentRole === 'president';

  if (isAdmin || isPresident) {
    const [{ data: profilesData }, { data: teamsData }, { data: membershipsData }, { data: rosterData }, { data: authUsers }] =
      await Promise.all([
        admin
          .from('profiles')
          .select('id, full_name, email, role, is_admin, is_president, is_financial_officer, active')
          .order('role')
          .order('full_name'),
        admin.from('teams').select('id, name').order('name'),
        admin
          .from('team_memberships')
          .select('id, team_id, user_id, team_role, is_active')
          .eq('is_active', true),
        admin
          .from('team_roster_members')
          .select('id, team_id, full_name, stanford_email, slack_user_id, joined_month, joined_year')
          .order('joined_year')
          .order('joined_month')
          .order('full_name'),
        admin.auth.admin.listUsers()
      ]);

    const profiles = (profilesData || []) as Profile[];
    const teams = (teamsData || []) as Team[];
    const teamMap = new Map(teams.map((team) => [team.id, team.name]));
    const memberships = (membershipsData || []) as Membership[];
    const leadMembershipUserIds = new Set(
      memberships.filter((membership) => membership.team_role === 'lead').map((membership) => membership.user_id)
    );
    const rosterMembers = (rosterData || []) as RosterMember[];

    const teamNamesByUser = new Map<string, string[]>();
    for (const membership of memberships) {
      const teamName = teamMap.get(membership.team_id);
      if (!teamName) continue;
      if (!teamNamesByUser.has(membership.user_id)) {
        teamNamesByUser.set(membership.user_id, []);
      }
      teamNamesByUser.get(membership.user_id)!.push(teamName);
    }

    const loginMap = new Map<string, string | null>();
    for (const authUser of authUsers?.users || []) {
      loginMap.set(authUser.id, authUser.last_sign_in_at || null);
    }

    const adminRows: AdminMemberRow[] = profiles.map((profile) => {
      const roleLabels = [
        profileHasAdminRole(profile) ? getRoleLabel('admin') : null,
        profileHasPresidentRole(profile) ? getRoleLabel('president') : null,
        profileHasFinancialOfficerRole(profile) ? getRoleLabel('financial_officer') : null,
        profileHasLeadRole(profile, leadMembershipUserIds.has(profile.id)) ? getRoleLabel('team_lead') : null
      ].filter(Boolean) as string[];
      const permissionLabels = [
        profileHasAdminRole(profile) ? 'Full portal access' : null,
        profileHasPresidentRole(profile) ? 'Read-only club-wide access' : null,
        profileHasFinancialOfficerRole(profile) ? 'Read-only finance access' : null,
        profileHasLeadRole(profile, leadMembershipUserIds.has(profile.id)) ? 'Lead workspace, purchases, tasks' : null
      ].filter(Boolean) as string[];

      return {
      id: `profile-${profile.id}`,
      profileId: profile.id,
      name: profile.full_name || 'Unnamed user',
      email: profile.email || 'No email found',
      role: roleLabels.join(', ') || 'Lead',
      permissions: permissionLabels.join(' · ') || 'Lead workspace, purchases, tasks',
      teams: (teamNamesByUser.get(profile.id) || []).join(', ') || 'None',
      accessLabel: loginMap.get(profile.id) ? 'Active' : 'Inactive',
      accessDetail: loginMap.get(profile.id) ? `Last login ${formatLastSeen(loginMap.get(profile.id)!)}` : 'Invite not accepted yet',
      canManagePassword: isAdmin && Boolean(profile.email),
      canDeletePortal:
        isAdmin &&
        !profileHasAdminRole(profile) &&
        !profileHasPresidentRole(profile) &&
        !profileHasFinancialOfficerRole(profile) &&
        profileHasLeadRole(profile, leadMembershipUserIds.has(profile.id)),
      sortGroup: profileHasAdminRole(profile) ? 0 : profileHasPresidentRole(profile) ? 1 : profileHasFinancialOfficerRole(profile) ? 2 : 3,
      sortName: profile.full_name || '',
      sortJoined: 0
      };
    });

    const rosterRows: AdminMemberRow[] = rosterMembers.map((member) => ({
      id: `roster-${member.id}`,
      name: member.full_name,
      email: member.stanford_email,
      role: 'Recorded member',
      permissions: 'Record only',
      teams: teamMap.get(member.team_id) || 'Unknown team',
      accessLabel: '',
      accessDetail: '',
      canManagePassword: false,
      canDeletePortal: false,
      sortGroup: 4,
      sortName: member.full_name,
      sortJoined: member.joined_year * 100 + member.joined_month
    }));

    const rows = [...adminRows, ...rosterRows].sort((a, b) => {
      if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
      if (a.sortGroup === 2 && a.sortJoined !== b.sortJoined) return a.sortJoined - b.sortJoined;
      return a.sortName.localeCompare(b.sortName);
    });

    return (
      <div className="hq-page">
        <section className="hq-page-head">
          <div className="hq-page-head-copy">
            <p className="hq-eyebrow">{isAdmin ? 'Admin' : 'President'}</p>
            <h1 className="hq-page-title">Manage members</h1>
            <p className="hq-subtitle">
              View all admins and leads, plus each person&apos;s role and associated team assignments.
            </p>
          </div>
        </section>

        <div className="hq-admin-members-layout">
          <section className="hq-panel hq-admin-members-main hq-surface-muted">
            <AdminMemberDirectory rows={rows} />
          </section>

          {isAdmin ? <aside className="hq-panel hq-admin-members-side hq-surface-muted">
            <div className="hq-section-head">
              <div className="hq-section-head-copy">
                <p className="hq-eyebrow">Invite</p>
                <h2 className="hq-section-title hq-section-title-compact">Add portal member</h2>
              </div>
            </div>

            <form action={invitePortalMemberAction} className="form-stack">
              <div className="field">
                <label className="label" htmlFor="admin-member-name">
                  Full name
                </label>
                <input className="input" id="admin-member-name" name="full_name" required />
              </div>

              <div className="field">
                <label className="label" htmlFor="admin-member-email">
                  Stanford email
                </label>
                <input
                  className="input"
                  id="admin-member-email"
                  name="email"
                  type="email"
                  placeholder="sunet@stanford.edu"
                  required
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="admin-member-team">
                  Lead assignment
                </label>
                <select className="select" id="admin-member-team" name="team_id" defaultValue="">
                  <option value="">Invite without team assignment</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <span className="helper">Inviting without assigning them to a team is not recommended.</span>
              </div>

              <div className="button-row">
                <button className="button-secondary" type="submit">
                  Send invite
                </button>
              </div>
            </form>
          </aside> : null}
        </div>
      </div>
    );
  }

  const primaryTeamId = (await getLeadTeamIds(user.id))[0];

  if (!primaryTeamId) {
    redirect('/dashboard');
  }

  const { data: leadMembershipsData } = await admin
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('team_id', primaryTeamId)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const leadMemberships = (leadMembershipsData || []) as Membership[];
  const { data: teamMembershipsData } = await admin
    .from('team_memberships')
    .select('id, team_id, user_id, team_role, is_active')
    .eq('team_id', primaryTeamId)
    .eq('is_active', true);

  const teamMemberships = (teamMembershipsData || []) as Membership[];

  const { data: team } = await admin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', primaryTeamId)
    .single<Team>();

  const { data: rosterData } = await admin
    .from('team_roster_members')
    .select('id, team_id, full_name, stanford_email, slack_user_id, joined_month, joined_year')
    .eq('team_id', primaryTeamId)
    .order('joined_year', { ascending: false })
    .order('joined_month', { ascending: false })
    .order('full_name');

  const rosterMembers = (rosterData || []) as RosterMember[];
  const leadIds = leadMemberships.map((membership) => membership.user_id);
  const { data: leadProfilesData } = await (leadIds.length
    ? admin.from('profiles').select('id, full_name, email').in('id', leadIds)
    : Promise.resolve({ data: [] }));
  const leadProfileMap = new Map((leadProfilesData || []).map((profile) => [profile.id, profile.full_name || 'Unnamed lead']));
  const leadEmailMap = new Map((leadProfilesData || []).map((profile) => [profile.id, profile.email || 'No email found']));
  const workspaceMembers: LeadWorkspaceMember[] = [
    ...leadMemberships.map((membership) => ({
      id: `lead-${membership.user_id}`,
      full_name: leadProfileMap.get(membership.user_id) || 'Unnamed lead',
      stanford_email: leadEmailMap.get(membership.user_id) || 'No email found',
      slack_user_id: null,
      joined_month: null,
      joined_year: null,
      source: 'lead' as const
    })),
    ...rosterMembers.map((member) => ({
      id: member.id,
      full_name: member.full_name,
      stanford_email: member.stanford_email,
      slack_user_id: member.slack_user_id || null,
      joined_month: member.joined_month,
      joined_year: member.joined_year,
      source: 'recorded' as const
    }))
  ];
  const totalCount = teamMemberships.length + rosterMembers.length;

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

        <LeadRosterWorkspace
          teamId={primaryTeamId}
          rosterMembers={workspaceMembers}
          leadCount={leadMemberships.length}
          totalTrackedCount={totalCount}
          monthOptions={monthOptions}
        />
      </div>
    </div>
  );
}
