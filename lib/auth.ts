import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export type AppRole = 'admin' | 'team_lead';

export type Profile = {
  id: string;
  full_name: string | null;
  role: AppRole;
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

export async function requireAdmin() {
  const { supabase, user } = await requireSignedInUser();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, active, created_at')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile || profile.role !== 'admin' || !profile.active) {
    redirect('/dashboard');
  }

  return { supabase, user, profile };
}
