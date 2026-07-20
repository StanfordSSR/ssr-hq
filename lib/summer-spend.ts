import { createAdminClient } from '@/lib/supabase-admin';
import { formatPacificDateKey, getReportingWindows } from '@/lib/academic-calendar';

// A team's summer-spending position, matching the numbers the team's leads see
// in the "New expense logged" Slack notice (see lib/team-expense-notify.ts):
//   planned  = predicted summer spend from the SUBMITTED year-end report
//   spent    = all purchases logged inside the Summer Quarter window
//   remaining = planned - spent
// Summer spending is tracked against this planned figure, NOT against the
// leftover of the annual budget.
export type TeamSummerSpend = {
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  plannedCents: number;
  spentCents: number;
  remainingCents: number;
  hasSubmittedPlan: boolean;
};

export type SummerSpendSummary = {
  academicYear: string;
  // A Summer Quarter window is defined for this academic year.
  summerExists: boolean;
  // Today falls inside the Summer Quarter window.
  summerActive: boolean;
  teams: TeamSummerSpend[];
  totalPlannedCents: number;
  totalSpentCents: number;
  totalRemainingCents: number;
};

function readPredictedSummerCents(data: unknown): number | null {
  const summer = (data as { summer?: { predictedSpendCents?: unknown } } | null)?.summer;
  return typeof summer?.predictedSpendCents === 'number' ? summer.predictedSpendCents : null;
}

// Per-team summer spend roll-up for the officer dashboard. Uses the same basis
// as the lead notification so the two never disagree: planned comes from the
// team's submitted EOY report, spent is every purchase in the Summer Quarter
// window (compared by Pacific date-key, inclusive).
export async function getSummerSpendSummary(academicYear: string): Promise<SummerSpendSummary> {
  const admin = createAdminClient();
  const windows = await getReportingWindows(academicYear);
  const summer = windows.find((window) => window.quarter === 'Summer Quarter');

  const empty: SummerSpendSummary = {
    academicYear,
    summerExists: Boolean(summer),
    summerActive: false,
    teams: [],
    totalPlannedCents: 0,
    totalSpentCents: 0,
    totalRemainingCents: 0
  };

  if (!summer) {
    return empty;
  }

  const startKey = formatPacificDateKey(summer.start);
  const endKey = formatPacificDateKey(summer.end);
  const nowKey = formatPacificDateKey(new Date());
  const summerActive = nowKey >= startKey && nowKey <= endKey;

  const [{ data: teamsData }, { data: reportsData }] = await Promise.all([
    admin.from('teams').select('id, name, logo_url').eq('is_active', true).order('name'),
    admin
      .from('eoy_reports')
      .select('team_id, data')
      .eq('academic_year', academicYear)
      .eq('status', 'submitted')
  ]);

  const teams = (teamsData || []) as Array<{ id: string; name: string; logo_url: string | null }>;
  const teamIds = teams.map((team) => team.id);

  const plannedByTeam = new Map<string, number>();
  for (const report of (reportsData || []) as Array<{ team_id: string; data: unknown }>) {
    const planned = readPredictedSummerCents(report.data);
    if (planned != null) {
      plannedByTeam.set(report.team_id, planned);
    }
  }

  // Summer-window spend per team. Fetch every purchase for these teams and sum
  // the ones whose Pacific date-key lands inside the window — identical to the
  // notifier, which does not filter by academic_year (summer straddles the
  // cycle boundary).
  const spentByTeam = new Map<string, number>();
  if (teamIds.length > 0) {
    const { data: purchases } = await admin
      .from('purchase_logs')
      .select('team_id, amount_cents, purchased_at')
      .in('team_id', teamIds);

    for (const purchase of (purchases || []) as Array<{
      team_id: string;
      amount_cents: number;
      purchased_at: string;
    }>) {
      const key = formatPacificDateKey(new Date(purchase.purchased_at));
      if (key >= startKey && key <= endKey) {
        spentByTeam.set(purchase.team_id, (spentByTeam.get(purchase.team_id) || 0) + purchase.amount_cents);
      }
    }
  }

  const rows: TeamSummerSpend[] = teams
    .map((team) => {
      const hasSubmittedPlan = plannedByTeam.has(team.id);
      const plannedCents = plannedByTeam.get(team.id) || 0;
      const spentCents = spentByTeam.get(team.id) || 0;
      return {
        teamId: team.id,
        teamName: team.name,
        logoUrl: team.logo_url,
        plannedCents,
        spentCents,
        remainingCents: plannedCents - spentCents,
        hasSubmittedPlan
      };
    })
    // Only teams that are actually part of summer spending: they submitted a
    // plan, or money was logged inside the summer window.
    .filter((row) => row.hasSubmittedPlan || row.spentCents > 0);

  return {
    academicYear,
    summerExists: true,
    summerActive,
    teams: rows,
    totalPlannedCents: rows.reduce((sum, row) => sum + row.plannedCents, 0),
    totalSpentCents: rows.reduce((sum, row) => sum + row.spentCents, 0),
    totalRemainingCents: rows.reduce((sum, row) => sum + row.remainingCents, 0)
  };
}
