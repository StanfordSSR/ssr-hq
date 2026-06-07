import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase-admin';
import { getNextReportState } from '@/lib/academic-calendar';
import { getEoyReportState } from '@/lib/eoy-report';

export const getLeadTeamIds = cache(async function getLeadTeamIds(userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('team_memberships')
    .select('team_id')
    .eq('user_id', userId)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  return (data || []).map((membership) => membership.team_id);
});

export const getLeadTaskIndicatorState = cache(async function getLeadTaskIndicatorState(userId: string) {
  const admin = createAdminClient();
  const myTeamIds = await getLeadTeamIds(userId);

  if (myTeamIds.length === 0) {
    return {
      hasPendingLeadTasks: false
    };
  }

  const staleThreshold = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const [
    { count: pendingReceiptCount },
    { count: allTeamsTaskCount },
    { data: taskRecipients },
    { data: taskCompletions },
    { count: allTeamsAnnouncementCount },
    { data: announcementRecipients },
    reportState,
    eoyState
  ] =
    await Promise.all([
      admin
        .from('purchase_logs')
        .select('id', { count: 'exact', head: true })
        .in('team_id', myTeamIds)
        .eq('payment_method', 'credit_card')
        .eq('receipt_not_needed', false)
        .is('receipt_path', null),
      admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('recipient_scope', 'all_teams'),
      admin.from('task_recipients').select('task_id').in('team_id', myTeamIds),
      admin.from('task_completions').select('task_id').in('team_id', myTeamIds),
      admin
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('recipient_scope', 'all_teams')
        .gte('event_at', staleThreshold),
      admin.from('announcement_recipients').select('announcement_id').in('team_id', myTeamIds),
      getNextReportState(),
      getEoyReportState()
    ]);

  const completedTaskIds = new Set((taskCompletions || []).map((entry) => entry.task_id));
  const hasAssignedAllTeamTask = (allTeamsTaskCount || 0) > completedTaskIds.size;
  const hasSpecificAssignedTasks = (taskRecipients || []).some((entry) => !completedTaskIds.has(entry.task_id));
  const hasAssignedTasks = hasAssignedAllTeamTask || hasSpecificAssignedTasks;
  const hasAnnouncements = (allTeamsAnnouncementCount || 0) > 0 || (announcementRecipients || []).length > 0;
  const hasPendingReceipts = (pendingReceiptCount || 0) > 0;
  let hasPendingReport = false;

  if (reportState.reportState === 'open') {
    const { data: submittedReport } = await admin
      .from('team_reports')
      .select('id')
      .in('team_id', myTeamIds)
      .eq('academic_year', reportState.academicYear)
      .eq('quarter', reportState.targetQuarter)
      .eq('status', 'submitted')
      .limit(1)
      .maybeSingle();

    hasPendingReport = !submittedReport;
  }

  let hasPendingEoyReport = false;

  if (eoyState.reportState === 'open') {
    const { data: submittedEoyReport } = await admin
      .from('eoy_reports')
      .select('id')
      .in('team_id', myTeamIds)
      .eq('academic_year', eoyState.academicYear)
      .eq('status', 'submitted')
      .limit(1)
      .maybeSingle();

    hasPendingEoyReport = !submittedEoyReport;
  }

  return {
    hasPendingLeadTasks:
      hasAssignedTasks || hasPendingReceipts || hasPendingReport || hasPendingEoyReport || hasAnnouncements
  };
});
