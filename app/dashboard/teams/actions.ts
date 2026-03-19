'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { recordAuditEvent } from '@/lib/audit';
import { syncNotificationQueue } from '@/lib/notification-queue';
import { env } from '@/lib/env';
import { getViewerContext } from '@/lib/auth';

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

function isNextRedirect(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.includes('NEXT_REDIRECT')
  );
}

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

async function getActionReturnPath(fallbackPath: string) {
  const referer = (await headers()).get('referer');

  if (!referer) {
    return fallbackPath;
  }

  try {
    const current = new URL(referer, env.siteUrl);
    const site = new URL(env.siteUrl);

    if (current.origin !== site.origin) {
      return fallbackPath;
    }

    return `${current.pathname}${current.search}`;
  } catch {
    return fallbackPath;
  }
}

function buildStatusPath(path: string, status: 'success' | 'error', message: string) {
  const url = new URL(path, env.siteUrl);
  url.searchParams.set('status', status);
  url.searchParams.set('message', message);
  return `${url.pathname}${url.search}`;
}

async function redirectWithActionStatus(status: 'success' | 'error', message: string, fallbackPath: string) {
  const nextPath = await getActionReturnPath(fallbackPath);
  redirect(buildStatusPath(nextPath, status, message));
}

async function runRedirectingAction(options: {
  fallbackPath: string;
  successMessage: string;
  action: () => Promise<void>;
}) {
  try {
    await options.action();
  } catch (error) {
    if (isNextRedirect(error)) {
      throw error;
    }

    await redirectWithActionStatus('error', getActionErrorMessage(error), options.fallbackPath);
  }

  await redirectWithActionStatus('success', options.successMessage, options.fallbackPath);
}

async function requireAdminProfile() {
  const context = await getViewerContext();

  if (context.currentRole !== 'admin') {
    redirect('/dashboard');
  }

  return context;
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function createTeamAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/teams',
    successMessage: 'Created the team.',
    action: async () => {
      const { user } = await requireAdminProfile();
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

      await recordAuditEvent({
        actorId: user.id,
        action: 'team.created',
        targetType: 'team',
        targetId: team.id,
        summary: `Created team "${name}".`,
        details: {
          description,
          initialLeadIds
        }
      });

      await syncNotificationQueue();
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/teams');
      revalidatePath('/dashboard/members');
    }
  });
}

export async function updateLeadTeamDescriptionAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/teams',
    successMessage: 'Updated the team details.',
    action: async () => {
      const { user, currentRole } = await getViewerContext();

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

      const isAdmin = currentRole === 'admin';
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

      await recordAuditEvent({
        actorId: user.id,
        action: 'team.updated',
        targetType: 'team',
        targetId: teamId,
        summary: 'Updated team description or logo.',
        details: {
          description,
          logoUrl: logoUrl || null
        }
      });

      revalidatePath('/dashboard');
      revalidatePath('/dashboard/teams');
      revalidatePath('/dashboard/finances');
    }
  });
}

export async function assignExistingLeadAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/teams',
    successMessage: 'Assigned the lead to the team.',
    action: async () => {
      const { user } = await requireAdminProfile();
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

      await recordAuditEvent({
        actorId: user.id,
        action: 'lead.assigned',
        targetType: 'team_membership',
        targetId: `${teamId}:${userId}`,
        summary: 'Assigned an existing lead to a team.',
        details: {
          teamId,
          userId
        }
      });

      await syncNotificationQueue();
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/teams');
      revalidatePath('/dashboard/members');
    }
  });
}

export async function removeLeadFromTeamAction(formData: FormData) {
  await runRedirectingAction({
    fallbackPath: '/dashboard/teams',
    successMessage: 'Removed the lead from the team.',
    action: async () => {
      const { user } = await requireAdminProfile();
      const membershipId = String(formData.get('membership_id') || '').trim();

      if (!membershipId) {
        throw new Error('Missing membership id.');
      }

      const admin = createAdminClient();
      const { data: membership } = await admin
        .from('team_memberships')
        .select('id, team_id, user_id')
        .eq('id', membershipId)
        .maybeSingle();

      if (!membership) {
        throw new Error('Membership not found.');
      }

      const { error } = await admin
        .from('team_memberships')
        .update({ is_active: false })
        .eq('id', membershipId);

      if (error) {
        throw new Error(error.message);
      }

      await recordAuditEvent({
        actorId: user.id,
        action: 'lead.removed',
        targetType: 'team_membership',
        targetId: membershipId,
        summary: 'Removed a lead from a team.',
        details: {
          teamId: membership.team_id,
          userId: membership.user_id
        }
      });

      await syncNotificationQueue();
      revalidatePath('/dashboard');
      revalidatePath('/dashboard/teams');
      revalidatePath('/dashboard/members');
    }
  });
}
