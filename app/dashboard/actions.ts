'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin, requireSignedInUser } from '@/lib/auth';
import { formatAcademicYear } from '@/lib/academic-calendar';
import { sendInviteEmail, sendTaskEmails } from '@/lib/notifications';
import { env } from '@/lib/env';

async function requireActiveProfile() {
  const { supabase, user } = await requireSignedInUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, active')
    .eq('id', user.id)
    .single();

  if (!profile?.active) {
    redirect('/login');
  }

  return { user, profile };
}

async function requireLeadTeam(teamId: string) {
  const { user, profile } = await requireActiveProfile();
  if (profile.role === 'admin') {
    return { user, profile };
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

  if (!membership) {
    redirect('/dashboard');
  }

  return { user, profile };
}

export async function updateClubBudgetAction(formData: FormData) {
  await requireAdmin();

  const academicYear = String(formData.get('academic_year') || '').trim();
  const totalBudget = Number(formData.get('total_budget') || 0);

  if (!academicYear) {
    throw new Error('Academic year is required.');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('club_budgets').upsert({
    academic_year: academicYear,
    total_budget_cents: Math.max(0, Math.round(totalBudget * 100))
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard/finances');
  revalidatePath('/dashboard');
}

export async function updateTeamBudgetAction(formData: FormData) {
  await requireAdmin();

  const academicYear = String(formData.get('academic_year') || '').trim();
  const teamId = String(formData.get('team_id') || '').trim();
  const annualBudget = Number(formData.get('annual_budget') || 0);

  if (!academicYear || !teamId) {
    throw new Error('Team and academic year are required.');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('team_budgets').upsert({
    team_id: teamId,
    academic_year: academicYear,
    annual_budget_cents: Math.max(0, Math.round(annualBudget * 100))
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard/finances');
  revalidatePath('/dashboard');
}

export async function logPurchaseAction(formData: FormData) {
  const teamId = String(formData.get('team_id') || '').trim();
  const amount = Number(formData.get('amount') || 0);
  const description = String(formData.get('description') || '').trim();
  const academicYear = String(formData.get('academic_year') || formatAcademicYear(new Date())).trim();

  if (!teamId || !description) {
    throw new Error('Team and description are required.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be greater than zero.');
  }

  const { user } = await requireLeadTeam(teamId);

  const admin = createAdminClient();
  const { error } = await admin.from('purchase_logs').insert({
    team_id: teamId,
    created_by: user.id,
    academic_year: academicYear,
    amount_cents: Math.round(amount * 100),
    description
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/purchases');
  revalidatePath('/dashboard/finances');
}

export async function createTaskAction(formData: FormData) {
  const { user, profile } = await requireActiveProfile();

  const title = String(formData.get('title') || '').trim();
  const details = String(formData.get('details') || '').trim();
  const recipientScope = String(formData.get('recipient_scope') || 'specific_teams').trim();
  const pushNotification = String(formData.get('push_notification') || '') === 'on';
  const teamIds = formData
    .getAll('team_ids')
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!title) {
    throw new Error('Task title is required.');
  }

  const admin = createAdminClient();
  let allowedTeamIds = teamIds;

  if (profile.role !== 'admin') {
    const { data: memberships } = await admin
      .from('team_memberships')
      .select('team_id')
      .eq('user_id', user.id)
      .eq('team_role', 'lead')
      .eq('is_active', true);

    const myTeamIds = new Set((memberships || []).map((membership) => membership.team_id));
    allowedTeamIds = allowedTeamIds.filter((teamId) => myTeamIds.has(teamId));

    if (recipientScope === 'all_teams') {
      throw new Error('Only admins can assign tasks to all teams.');
    }
  }

  const { data: task, error } = await admin
    .from('tasks')
    .insert({
      title,
      details: details || null,
      recipient_scope: recipientScope === 'all_teams' ? 'all_teams' : 'specific_teams',
      push_notification: pushNotification,
      created_by: user.id,
      is_active: true
    })
    .select('id')
    .single();

  if (error || !task) {
    throw new Error(error?.message || 'Failed to create task.');
  }

  if (recipientScope !== 'all_teams' && allowedTeamIds.length > 0) {
    const { error: recipientsError } = await admin
      .from('task_recipients')
      .insert(allowedTeamIds.map((teamId) => ({ task_id: task.id, team_id: teamId })));

    if (recipientsError) {
      throw new Error(recipientsError.message);
    }
  }

  if (pushNotification) {
    const recipientTeamIds =
      recipientScope === 'all_teams'
        ? (
            await admin
              .from('team_memberships')
              .select('team_id')
              .eq('team_role', 'lead')
              .eq('is_active', true)
          ).data?.map((membership) => membership.team_id) || []
        : allowedTeamIds;
    const uniqueTeamIds = Array.from(new Set(recipientTeamIds));

    if (uniqueTeamIds.length > 0) {
      const { data: leadMemberships } = await admin
        .from('team_memberships')
        .select('user_id, team_id')
        .in('team_id', uniqueTeamIds)
        .eq('team_role', 'lead')
        .eq('is_active', true);

      const uniqueLeadIds = Array.from(new Set((leadMemberships || []).map((membership) => membership.user_id)));
      const { data: authUsers } = await admin.auth.admin.listUsers();
      const emailMap = new Map(authUsers.users.map((authUser) => [authUser.id, authUser.email || '']));
      const recipientEmails = uniqueLeadIds.map((leadId) => emailMap.get(leadId) || '').filter(Boolean);

      await sendTaskEmails({
        to: recipientEmails,
        title,
        details: details || 'Open SSR HQ to review this task.'
      });
    }
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/tasks');
}

export async function invitePortalMemberAction(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') || '').trim();
  const teamId = String(formData.get('team_id') || '').trim();

  if (!email) {
    throw new Error('Email is required.');
  }

  const admin = createAdminClient();
  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${env.siteUrl}/auth/callback`,
      data: {
        full_name: fullName,
        role: 'team_lead'
      }
    }
  });

  if (generateError || !generated?.properties?.action_link || !generated.user?.id) {
    throw new Error(generateError?.message || 'Failed to generate invite link.');
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: generated.user.id,
    full_name: fullName || null,
    role: 'team_lead',
    active: true
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  let teamName: string | null = null;
  if (teamId) {
    const { data: team } = await admin.from('teams').select('id, name').eq('id', teamId).single();

    if (!team) {
      throw new Error('Selected team not found.');
    }

    teamName = team.name;

    const { error: membershipError } = await admin.from('team_memberships').upsert(
      {
        team_id: teamId,
        user_id: generated.user.id,
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
  }

  await sendInviteEmail({
    to: email,
    fullName,
    teamName,
    actionLink: generated.properties.action_link
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/teams');
  revalidatePath('/dashboard/members');
}

export async function addTeamRosterMemberAction(formData: FormData) {
  const teamId = String(formData.get('team_id') || '').trim();
  const fullName = String(formData.get('full_name') || '').trim();
  const stanfordEmail = String(formData.get('stanford_email') || '').trim().toLowerCase();
  const joinedMonth = Number(formData.get('joined_month') || 0);
  const joinedYear = Number(formData.get('joined_year') || 0);

  if (!teamId || !fullName || !stanfordEmail) {
    throw new Error('Team, full name, and Stanford email are required.');
  }

  if (!stanfordEmail.endsWith('@stanford.edu')) {
    throw new Error('Member email must be a Stanford email.');
  }

  if (!Number.isInteger(joinedMonth) || joinedMonth < 1 || joinedMonth > 12) {
    throw new Error('Joined month must be between 1 and 12.');
  }

  if (!Number.isInteger(joinedYear) || joinedYear < 2000 || joinedYear > 2100) {
    throw new Error('Joined year is invalid.');
  }

  const { user } = await requireLeadTeam(teamId);
  const admin = createAdminClient();
  const { error } = await admin.from('team_roster_members').insert({
    team_id: teamId,
    full_name: fullName,
    stanford_email: stanfordEmail,
    joined_month: joinedMonth,
    joined_year: joinedYear,
    created_by: user.id
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/members');
}
