'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

async function requireAdminProfile() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin' || !profile.active) {
    redirect('/dashboard');
  }

  return { user, profile };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function createTeamAction(formData: FormData) {
  await requireAdminProfile();

  const name = String(formData.get('name') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const approved = String(formData.get('board_approved') || '') === 'on';
  const truthful = String(formData.get('truthful_ack') || '') === 'on';
  const leadOneId = String(formData.get('lead_one_id') || '').trim();
  const leadTwoId = String(formData.get('lead_two_id') || '').trim();
  const captchaLeft = Number(formData.get('captcha_left') || 0);
  const captchaRight = Number(formData.get('captcha_right') || 0);
  const captchaAnswer = Number(formData.get('captcha_answer') || NaN);

  if (!name) {
    throw new Error('Team name is required.');
  }

  if (description.length > 300) {
    throw new Error('Team description must be 300 characters or fewer.');
  }

  if (!approved || !truthful) {
    throw new Error('You must confirm board approval and truthfulness.');
  }

  if (!Number.isFinite(captchaAnswer) || captchaAnswer !== captchaLeft + captchaRight) {
    throw new Error('Captcha answer is incorrect.');
  }

  const initialLeadIds = [leadOneId, leadTwoId].filter(Boolean);
  if (new Set(initialLeadIds).size !== initialLeadIds.length) {
    throw new Error('Initial leads must be unique.');
  }

  if (initialLeadIds.length > 2) {
    throw new Error('You can assign at most 2 initial leads here.');
  }

  const admin = createAdminClient();

  const { data: team, error: teamError } = await admin
    .from('teams')
    .insert({
      name,
      slug: slugify(name),
      description: description || null,
      is_active: true
    })
    .select('id')
    .single();

  if (teamError || !team) {
    throw new Error(teamError?.message || 'Failed to create team.');
  }

  if (initialLeadIds.length > 0) {
    const membershipRows = initialLeadIds.map((userId) => ({
      team_id: team.id,
      user_id: userId,
      team_role: 'lead',
      is_active: true
    }));

    const { error: membershipError } = await admin
      .from('team_memberships')
      .upsert(membershipRows, { onConflict: 'team_id,user_id' });

    if (membershipError) {
      throw new Error(membershipError.message);
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/teams');
  revalidatePath('/dashboard/members');
}

export async function updateLeadTeamDescriptionAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const teamId = String(formData.get('team_id') || '').trim();
  const description = String(formData.get('description') || '').trim();
  const logoUrl = String(formData.get('logo_url') || '').trim();

  if (!teamId) {
    throw new Error('Missing team id.');
  }

  if (description.length > 300) {
    throw new Error('Description must be 300 characters or fewer.');
  }

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('team_memberships')
    .select('id')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('team_role', 'lead')
    .eq('is_active', true)
    .maybeSingle();

  const { data: profile } = await admin
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin' && profile.active;
  if (!isAdmin && !membership) {
    throw new Error('You are not allowed to edit this team.');
  }

  const { error } = await admin
    .from('teams')
    .update({
      description: description || null,
      logo_url: logoUrl || null
    })
    .eq('id', teamId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/members');
  revalidatePath('/dashboard/purchases');
  revalidatePath('/dashboard/tasks');
  revalidatePath('/dashboard/teams');
}

export async function assignExistingLeadAction(formData: FormData) {
  await requireAdminProfile();

  const teamId = String(formData.get('team_id') || '').trim();
  const userId = String(formData.get('user_id') || '').trim();

  if (!teamId || !userId) {
    throw new Error('Team and user are required.');
  }

  const admin = createAdminClient();

  const { data: targetProfile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, active')
    .eq('id', userId)
    .single();

  if (profileError || !targetProfile) {
    throw new Error('Could not find that user.');
  }

  if (targetProfile.role !== 'team_lead') {
    throw new Error('Only users with portal role "team_lead" can be assigned as team leads.');
  }

  if (!targetProfile.active) {
    throw new Error('That user is inactive.');
  }

  const { error } = await admin.from('team_memberships').upsert(
    {
      team_id: teamId,
      user_id: userId,
      team_role: 'lead',
      is_active: true
    },
    { onConflict: 'team_id,user_id' }
  );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/teams');
  revalidatePath('/dashboard/members');
}

export async function removeLeadFromTeamAction(formData: FormData) {
  await requireAdminProfile();

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
  revalidatePath('/dashboard/teams');
  revalidatePath('/dashboard/members');
}
