import { createAdminClient } from '@/lib/supabase-admin';
import {
  formatPacificDateKey,
  getReportingWindows
} from '@/lib/academic-calendar';
import { getTeamAnnualBudgetCents, getYearFundsSpentCents } from '@/lib/eoy-report';
import {
  sendSlackbotNotification,
  SLACKBOT_SYSTEM_TEAM_ID,
  SLACKBOT_SYSTEM_TEAM_NAME
} from '@/lib/slackbot';
import { env } from '@/lib/env';

function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

// Summer-quarter remaining = predicted summer spend, minus summer spend so far
// (excluding the just-logged item), minus the just-logged item.
export function summerRemainingCents(
  predictedSpendCents: number,
  summerSpentBeforeCents: number,
  loggedAmountCents: number
): number {
  return predictedSpendCents - summerSpentBeforeCents - loggedAmountCents;
}

// Outside summer, remaining = annual budget minus funds spent this year (which
// already includes the just-logged item).
export function annualRemainingCents(annualBudgetCents: number, yearSpentCents: number): number {
  return annualBudgetCents - yearSpentCents;
}

type NotifyArgs = {
  teamId: string;
  academicYear: string;
  purchaseId: string;
  loggedById: string;
  loggedByName: string;
  loggedAmountCents: number;
  description: string;
};

// When someone who is NOT a lead of the team logs an expense to it (a president,
// financial officer, or admin), Slack-message the team's active leads with the
// amount logged and how much budget they have left.
//
// Remaining budget:
//   - During Summer Quarter: the team's predicted summer spend (from their
//     year-end report) minus summer-quarter spend SO FAR (excluding this item)
//     minus the amount just logged.
//   - Otherwise: the team's annual budget minus funds spent this year.
//
// Best-effort: any failure is swallowed so it never blocks the expense log.
export async function notifyTeamLeadsOfExpense(args: NotifyArgs): Promise<void> {
  const { teamId, academicYear, purchaseId, loggedById, loggedByName, loggedAmountCents, description } =
    args;
  const admin = createAdminClient();

  // Active leads of this team.
  const { data: leadRows } = await admin
    .from('team_memberships')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('team_role', 'lead')
    .eq('is_active', true);

  const leadIds = Array.from(new Set((leadRows || []).map((row) => row.user_id as string)));
  if (leadIds.length === 0) return;

  // If the person who logged it is themselves a lead of this team, they already
  // know — don't notify.
  if (leadIds.includes(loggedById)) return;

  const { data: leadProfiles } = await admin
    .from('profiles')
    .select('id, email, active')
    .in('id', leadIds);

  const emails = ((leadProfiles || []) as Array<{ email: string | null; active: boolean | null }>)
    .filter((p) => p.active && p.email)
    .map((p) => p.email as string);
  if (emails.length === 0) return;

  const { data: teamRow } = await admin.from('teams').select('name').eq('id', teamId).maybeSingle();
  const teamName = teamRow?.name || 'your team';

  // Decide summer vs. annual basis.
  const windows = await getReportingWindows(academicYear);
  const summer = windows.find((window) => window.quarter === 'Summer Quarter');
  const nowKey = formatPacificDateKey(new Date());
  const inSummer =
    summer != null &&
    nowKey >= formatPacificDateKey(summer.start) &&
    nowKey <= formatPacificDateKey(summer.end);

  let remainingCents: number;
  let basisLine: string;

  // The team's year-end report predicted summer spend, if a report exists.
  const { data: report } = await admin
    .from('eoy_reports')
    .select('data')
    .eq('team_id', teamId)
    .eq('academic_year', academicYear)
    .maybeSingle();
  const predictedSummerCents =
    typeof (report?.data as { summer?: { predictedSpendCents?: unknown } } | null)?.summer
      ?.predictedSpendCents === 'number'
      ? ((report!.data as { summer: { predictedSpendCents: number } }).summer.predictedSpendCents)
      : null;

  if (inSummer && summer && predictedSummerCents != null) {
    // Summer-quarter spend so far, EXCLUDING the just-logged purchase.
    const sStart = formatPacificDateKey(summer.start);
    const sEnd = formatPacificDateKey(summer.end);
    const { data: purchases } = await admin
      .from('purchase_logs')
      .select('id, amount_cents, purchased_at')
      .eq('team_id', teamId)
      .neq('id', purchaseId);

    const summerSpentBeforeCents = ((purchases || []) as Array<{
      amount_cents: number;
      purchased_at: string;
    }>).reduce((sum, purchase) => {
      const key = formatPacificDateKey(new Date(purchase.purchased_at));
      return key >= sStart && key <= sEnd ? sum + purchase.amount_cents : sum;
    }, 0);

    remainingCents = summerRemainingCents(
      predictedSummerCents,
      summerSpentBeforeCents,
      loggedAmountCents
    );
    basisLine = `Summer budget remaining: *${usd(remainingCents)}* (of your ${usd(
      predictedSummerCents
    )} planned summer spend).`;
  } else {
    const [annualBudgetCents, yearSpentCents] = await Promise.all([
      getTeamAnnualBudgetCents(teamId, academicYear),
      getYearFundsSpentCents(teamId, academicYear)
    ]);
    remainingCents = annualRemainingCents(annualBudgetCents, yearSpentCents);
    basisLine = `Budget remaining: *${usd(remainingCents)}* of ${usd(annualBudgetCents)}.`;
  }

  await sendSlackbotNotification({
    idempotency_key: `team_expense_logged:${purchaseId}`,
    type: 'manual_message',
    team_id: SLACKBOT_SYSTEM_TEAM_ID,
    team_name: SLACKBOT_SYSTEM_TEAM_NAME,
    recipient_emails: emails,
    title: `New expense logged for ${teamName}`,
    message:
      `${loggedByName || 'A club officer'} logged a *${usd(loggedAmountCents)}* expense to ${teamName}: ` +
      `"${description}".\n${basisLine}`,
    cta_label: 'View finances',
    cta_url: `${env.siteUrl}/dashboard/finances`,
    metadata: { team_id: teamId, purchase_id: purchaseId, remaining_cents: remainingCents }
  });
}
