import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

export type AppRole = 'admin' | 'president' | 'team_lead';
export const ACTIVE_ROLE_COOKIE = 'hq_active_role';

export type Profile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  role: AppRole;
  is_admin?: boolean | null;
  is_president?: boolean | null;
  active: boolean;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type TeamMembership = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: 'lead' | 'member';
  is_active: boolean;
  created_at: string;
};

export async function requireSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return { supabase, user };
}

export function profileHasAdminRole(profile: Pick<Profile, 'role' | 'is_admin'>) {
  return profile.role === 'admin' || Boolean(profile.is_admin);
}

export function profileHasPresidentRole(profile: Pick<Profile, 'role' | 'is_president'>) {
  return profile.role === 'president' || Boolean(profile.is_president);
}

export function profileHasLeadRole(profile: Pick<Profile, 'role'>, hasLeadRole: boolean) {
  return hasLeadRole || profile.role === 'team_lead';
}

export function getAvailableRoles(profile: Pick<Profile, 'role' | 'is_admin' | 'is_president'>, hasLeadRole: boolean) {
  const roles: AppRole[] = [];

  if (profileHasAdminRole(profile)) {
    roles.push('admin');
  }

  if (profileHasPresidentRole(profile)) {
    roles.push('president');
  }

  if (profileHasLeadRole(profile, hasLeadRole)) {
    roles.push('team_lead');
  }

  return roles;
}

function getDefaultRole(roles: AppRole[]) {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('president')) return 'president';
  return 'team_lead';
}

export async function getViewerContext() {
  const { supabase, user } = await requireSignedInUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_admin, is_president, active, created_at')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile?.active) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const { count: leadMembershipCount } = await admin
    .from('team_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const availableRoles = getAvailableRoles(profile, (leadMembershipCount || 0) > 0);
  if (availableRoles.length === 0) {
    availableRoles.push('team_lead');
  }

  const selectedRole = (await cookies()).get(ACTIVE_ROLE_COOKIE)?.value as AppRole | undefined;
  const currentRole = selectedRole && availableRoles.includes(selectedRole) ? selectedRole : getDefaultRole(availableRoles);

  return {
    supabase,
    admin,
    user,
    profile,
    availableRoles,
    currentRole
  };
}

export async function requireAdmin() {
  const context = await getViewerContext();

  if (context.currentRole !== 'admin') {
    redirect('/dashboard');
  }

  return context;
}

export async function requireAdminOrPresident() {
  const context = await getViewerContext();

  if (context.currentRole !== 'admin' && context.currentRole !== 'president') {
    redirect('/dashboard');
  }

  return context;
}

export function getRoleLabel(role: AppRole) {
  if (role === 'admin') return 'Admin';
  if (role === 'president') return 'President';
  return 'Team lead';
}
