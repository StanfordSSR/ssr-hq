'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin, requireSignedInUser } from '@/lib/auth';
import { env } from '@/lib/env';

export async function signOutAction() {
  const { supabase } = await requireSignedInUser();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function inviteLeadAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || 'team_lead');

  if (!email) {
    throw new Error('Email is required.');
  }

  if (role !== 'admin' && role !== 'team_lead') {
    throw new Error('Invalid role.');
  }

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${env.siteUrl}/auth/callback`,
    data: {
      full_name: fullName,
      role
    }
  });

  if (error) {
    throw new Error(error.message);
  }

  if (data.user?.id) {
    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      full_name: fullName || null,
      role,
      active: true
    });

    if (profileError) {
      throw new Error(profileError.message);
    }
  }

  revalidatePath('/dashboard');
}

export async function deactivateLeadAction(formData: FormData) {
  const { user } = await requireAdmin();

  const targetId = String(formData.get('target_id') || '');

  if (!targetId) {
    throw new Error('Missing target id.');
  }

  if (targetId === user.id) {
    throw new Error('You cannot deactivate yourself from the dashboard.');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ active: false }).eq('id', targetId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
}
