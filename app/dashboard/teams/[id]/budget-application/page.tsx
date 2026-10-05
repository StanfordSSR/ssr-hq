import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getViewerContext, profileHasPresidentRole } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getBudgetSetupState } from '@/lib/budget-plan';
import { getLeadTeamIds } from '@/lib/lead-state';
import { createAdminClient } from '@/lib/supabase-admin';
import { getTeamBudgetApplication, getTeamBudgetCaps } from '@/lib/team-budget-application';
import { getFixedTravelItems, hasFixedTravelItems, withFixedTravelItems } from '@/lib/team-budget-fixed-travel';
import { withFoodQuarterItems } from '@/lib/team-budget-food';
import { canViewTeamBudgetApplication, formatTeamBudgetDeadline, isTeamBudgetApplicationClosed, selectTeamApplicationYear, TEAM_BUDGET_ACADEMIC_YEAR } from '@/lib/team-budget-application-rules';
import { TeamBudgetApplicationEditor } from '@/components/team-budget-application-editor';

export default async function TeamBudgetApplicationPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ year?: string | string[] }>;
}) {
  const { id: teamId } = await params;
  const { user, currentRole, profile } = await getViewerContext();
  const isOfficer = ['admin', 'president', 'vice_president', 'financial_officer'].includes(currentRole);
  const isPresident = profileHasPresidentRole(profile);
  const leadTeamIds = await getLeadTeamIds(user.id);
  const isLead = leadTeamIds.includes(teamId);
  if (!canViewTeamBudgetApplication(currentRole, isLead, isPresident)) redirect('/dashboard');

  const admin = createAdminClient();
  const setup = await getBudgetSetupState();
  const academicYear = selectTeamApplicationYear(setup, (await searchParams)?.year);
  const isClosed = isTeamBudgetApplicationClosed(academicYear);
  const [{ data: team, error: teamError }, { plan, caps }, application] = await Promise.all([
    admin.from('teams').select('id, name, slug, is_active').eq('id', teamId).maybeSingle(),
    getTeamBudgetCaps(teamId, academicYear),
    getTeamBudgetApplication(teamId, academicYear)
  ]);
  if (teamError || !team) notFound();

  const canEdit = !isClosed && isLead && team.is_active && Boolean(plan);
  const fixedTravel = getFixedTravelItems(team.slug, academicYear);
  const savedItems = application?.items || [];
  const submitted = application?.status === 'submitted';
  const foodItems = submitted ? savedItems : withFoodQuarterItems(savedItems, caps.food);
  const initialItems = submitted ? savedItems : withFixedTravelItems(foodItems, fixedTravel);
  return (
    <div className="hq-page th-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{team.name} · {academicYear}</p>
          <h1 className="hq-page-title">Annual budget application</h1>
          <p className="hq-subtitle">
            {application?.status === 'submitted'
              ? `Submitted ${application.submittedAt ? formatDateLabel(new Date(application.submittedAt)) : ''}`
              : isClosed ? 'Submission closed' : plan ? 'Draft' : 'Budget plan unavailable'}
          </p>
          {academicYear === TEAM_BUDGET_ACADEMIC_YEAR ? <p className="hq-inline-note">Due {formatTeamBudgetDeadline()}</p> : null}
        </div>
        <div className="hq-page-head-action">
          <Link href={isOfficer || isPresident ? '/dashboard/finances/applications' : `/dashboard/teams/${teamId}`} className="button-secondary">
            {isOfficer || isPresident ? 'Team applications' : 'Team page'}
          </Link>
        </div>
      </section>

      <nav className="hq-tab-row" aria-label="Application year">
        {[setup.academicYear, ...(setup.setupState === 'upcoming' ? [] : [setup.nextAcademicYear])].map((year) => (
          <Link
            key={year}
            href={`/dashboard/teams/${teamId}/budget-application?year=${year}`}
            className={`hq-tab-button ${academicYear === year ? 'hq-tab-button-active' : ''}`}
            aria-current={academicYear === year ? 'page' : undefined}
          >
            {year}
          </Link>
        ))}
      </nav>

      {!plan && !application ? (
        <p className="empty-note">The {academicYear} budget plan is not available yet.</p>
      ) : (
        <TeamBudgetApplicationEditor
          key={academicYear}
          teamId={teamId}
          academicYear={academicYear}
          caps={caps}
          initialItems={initialItems}
          fixedTravelItems={fixedTravel}
          initialPrefillPending={!submitted && (foodItems !== savedItems || !hasFixedTravelItems(savedItems, fixedTravel))}
          initialVersion={application?.version || 0}
          initialStatus={application?.status || 'draft'}
          initialUpdatedAt={application?.updatedAt || null}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
