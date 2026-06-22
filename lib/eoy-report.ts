import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase-admin';
import {
  formatCountdown,
  formatPacificDateLabel,
  formatPacificDateKey,
  getCurrentAcademicYear,
  getNextAcademicYear,
  getReportingWindows
} from '@/lib/academic-calendar';
import {
  EOY_REPORT_TITLE,
  getEoyWindow,
  isMonthDay,
  mergeQuestions,
  type EoyMemberRef,
  type EoyReportSettings,
  type EoyReportState
} from '@/lib/eoy-report-shared';

export * from '@/lib/eoy-report-shared';

const getEoyReportSettingsCached = cache(async function getEoyReportSettingsCached(): Promise<EoyReportSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('eoy_report_settings')
    .select('due_month_day, email_enabled, slack_enabled, reminder_days, questions')
    .eq('id', 1)
    .maybeSingle();

  return {
    dueMonthDay: isMonthDay(data?.due_month_day) ? data!.due_month_day : '06-20',
    emailEnabled: data?.email_enabled ?? true,
    slackEnabled: data?.slack_enabled ?? false,
    reminderDays: Array.isArray(data?.reminder_days) && data!.reminder_days.length ? data!.reminder_days : [14, 7, 1],
    questions: mergeQuestions(data?.questions)
  };
});

export async function getEoyReportSettings(): Promise<EoyReportSettings> {
  return getEoyReportSettingsCached();
}

export async function getEoyReportState(now = new Date()): Promise<EoyReportState> {
  const [academicYear, settings] = await Promise.all([getCurrentAcademicYear(now), getEoyReportSettings()]);
  const nextAcademicYear = getNextAcademicYear(academicYear);
  const { openAt, dueAt } = getEoyWindow(academicYear, settings.dueMonthDay);

  let reportState: EoyReportState['reportState'];
  let message: string;
  let countdownTarget: Date;

  if (now < openAt) {
    reportState = 'upcoming';
    message = `${EOY_REPORT_TITLE} opens on ${formatPacificDateLabel(openAt)}.`;
    countdownTarget = openAt;
  } else if (now <= dueAt) {
    reportState = 'open';
    message = `${EOY_REPORT_TITLE} is open and due by ${formatPacificDateLabel(dueAt)} at 6 PM PT.`;
    countdownTarget = dueAt;
  } else {
    reportState = 'closed';
    message = `${EOY_REPORT_TITLE} closed on ${formatPacificDateLabel(dueAt)} at 6 PM PT.`;
    countdownTarget = dueAt;
  }

  return {
    academicYear,
    nextAcademicYear,
    reportState,
    openAt,
    dueAt,
    message,
    countdownLabel: formatCountdown(countdownTarget, now)
  };
}

// Funds spent across Fall, Winter, and Spring quarters of the academic year.
export async function getYearFundsSpentCents(teamId: string, academicYear: string) {
  const windows = await getReportingWindows(academicYear);
  const autumn = windows.find((window) => window.quarter === 'Autumn Quarter');
  const spring = windows.find((window) => window.quarter === 'Spring Quarter');
  if (!autumn || !spring) {
    return 0;
  }

  const admin = createAdminClient();
  const { data: purchasesData } = await admin
    .from('purchase_logs')
    .select('amount_cents, purchased_at')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear);

  const startKey = formatPacificDateKey(autumn.start);
  const endKey = formatPacificDateKey(spring.end);

  return ((purchasesData || []) as Array<{ amount_cents: number; purchased_at: string }>).reduce((sum, purchase) => {
    const purchaseKey = formatPacificDateKey(new Date(purchase.purchased_at));
    if (purchaseKey < startKey || purchaseKey > endKey) {
      return sum;
    }
    return sum + purchase.amount_cents;
  }, 0);
}

// Returns the summer-spending block for a team, or null when the team is in good standing.
export async function getEoySummerBlock(teamId: string): Promise<{ reason: string | null } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('eoy_summer_blocks')
    .select('reason')
    .eq('team_id', teamId)
    .maybeSingle();
  return data ? { reason: data.reason ?? null } : null;
}

export async function getTeamAnnualBudgetCents(teamId: string, academicYear: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('team_budgets')
    .select('annual_budget_cents')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear)
    .maybeSingle();
  return data?.annual_budget_cents || 0;
}

// People who can be selected as next-year leads or summer members:
// the team's current portal leads plus its recorded roster members.
export async function getEoyTeamMembers(teamId: string): Promise<EoyMemberRef[]> {
  const admin = createAdminClient();
  const [{ data: memberships }, { data: roster }] = await Promise.all([
    admin.from('team_memberships').select('user_id').eq('team_id', teamId).eq('is_active', true),
    admin.from('team_roster_members').select('id, full_name').eq('team_id', teamId)
  ]);

  const userIds = Array.from(new Set((memberships || []).map((membership) => membership.user_id)));
  const { data: profiles } = userIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

  const leadRefs: EoyMemberRef[] = (profiles || []).map((profile) => ({
    id: profile.id,
    name: profile.full_name || profile.email || 'Unnamed lead',
    source: 'profile' as const
  }));
  const rosterRefs: EoyMemberRef[] = ((roster || []) as Array<{ id: string; full_name: string }>).map((member) => ({
    id: member.id,
    name: member.full_name,
    source: 'roster' as const
  }));

  return [...leadRefs, ...rosterRefs].sort((a, b) => a.name.localeCompare(b.name));
}
