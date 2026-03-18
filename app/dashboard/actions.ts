'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin, requireSignedInUser } from '@/lib/auth';
import { env } from '@/lib/env';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

export async function signOutAction() {
  const { supabase } = await requireSignedInUser();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function createTeamAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();

  if (!name) {
    throw new Error('Team name is required.');
  }

  const admin = createAdminClient();

  const { error } = await admin.from('teams').insert({
    name,
    slug: slugify(name),
    description: description || null,
    is_active: true
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
}

export async function inviteLeadToTeamAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') || '').trim();
  const teamId = String(formData.get('team_id') || '').trim();

  if (!email) {
    throw new Error('Email is required.');
  }

  if (!teamId) {
    throw new Error('Team is required.');
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback`,
    data: {
      full_name: fullName,
      role: 'team_lead'
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user?.id) {
    throw new Error('Supabase did not return an invited user id.');
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: data.user.id,
    full_name: fullName || null,
    role: 'team_lead',
    active: true
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: membershipError } = await admin.from('team_memberships').upsert(
    {
      team_id: teamId,
      user_id: data.user.id,
      team_role: 'lead',
      is_active: true
    },
    {
      onConflict: 'team_id,user_id'
    }
  );

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  revalidatePath('/dashboard');
}

export async function removeLeadFromTeamAction(formData: FormData) {
  await requireAdmin();

  const membershipId = String(formData.get('membership_id') || '').trim();

  if (!membershipId) {
    throw new Error('Missing membership id.');
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('team_memberships')
    .update({ is_active: false })
    .eq('id', membershipId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
}

export async function deactivateUserAction(formData: FormData) {
  const { user } = await requireAdmin();

  const targetId = String(formData.get('target_id') || '').trim();

  if (!targetId) {
    throw new Error('Missing target user id.');
  }

  if (targetId === user.id) {
    throw new Error('You cannot deactivate yourself from the dashboard.');
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('profiles')
    .update({ active: false })
    .eq('id', targetId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
}
