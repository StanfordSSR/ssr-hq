import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import {
  computePlanRollup,
  getActiveBudgetPlan,
  getBudgetSetupState,
  getPlanBundle,
  getQuarterDeclarationState
} from '@/lib/budget-plan';
import { createBudgetPlanAction, openQuarterDeclarationAction } from '@/app/dashboard/actions';
import { BudgetPlanEditor, QuarterlyDeclarationPanel } from '@/components/budget-plan-editor';

export default async function BudgetPlanPage() {
  const admin = createAdminClient();
  const { user, currentRole, profile } = await getViewerContext();
  if (currentRole !== 'admin' && currentRole !== 'president' && currentRole !== 'financial_officer') {
    redirect('/dashboard');
  }
  const canEdit = currentRole === 'admin';
  const isPresident = currentRole === 'president' || profile.role === 'president' || Boolean(profile.is_president);

  const [setup, quarterState] = await Promise.all([getBudgetSetupState(), getQuarterDeclarationState()]);
  const targetYear = setup.setupState === 'open' ? setup.nextAcademicYear : setup.academicYear;

  const [{ data: teamsData }, { data: presidentsData }, plan] = await Promise.all([
    admin.from('teams').select('id, name').eq('is_active', true).order('name'),
    admin.from('profiles').select('id, full_name, role, is_president').eq('active', true),
    getActiveBudgetPlan(targetYear)
  ]);
  const teams = ((teamsData || []) as Array<{ id: string; name: string }>).map((t) => ({ id: t.id, name: t.name }));
  const presidents = ((presidentsData || []) as Array<{ id: string; full_name: string | null; role: string; is_president: boolean }>)
    .filter((p) => p.role === 'president' || p.is_president)
    .map((p) => ({ id: p.id, fullName: p.full_name || 'President' }));

  // Quarterly declaration (current year's approved plan), if a window is open.
  let quarterlySection: React.ReactNode = null;
  if (quarterState) {
    const currentPlan = await getActiveBudgetPlan(setup.academicYear);
    if (currentPlan && currentPlan.status === 'approved') {
      const { data: decl } = await admin
        .from('budget_quarter_declarations')
        .select('id, status')
        .eq('plan_id', currentPlan.id)
        .eq('quarter', quarterState.quarter)
        .neq('status', 'superseded')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (decl) {
        const [{ data: values }, { data: items }, { data: approvals }] = await Promise.all([
          admin.from('budget_quarterly_values').select('expense_item_id, amount_cents').eq('declaration_id', decl.id),
          admin.from('budget_expense_items').select('id, label').eq('plan_id', currentPlan.id).eq('lock_cadence', 'quarterly'),
          admin.from('budget_approvals').select('president_id, signature').eq('target_type', 'quarter').eq('target_id', decl.id)
        ]);
        const valueMap = new Map((values || []).map((v) => [v.expense_item_id, v.amount_cents]));
        const declItems = ((items || []) as Array<{ id: string; label: string }>).map((item) => ({
          expenseItemId: item.id,
          label: item.label,
          amountCents: valueMap.get(item.id) || 0
        }));
        quarterlySection = (
          <QuarterlyDeclarationPanel
            declarationId={decl.id}
            quarter={quarterState.quarter}
            status={decl.status as 'draft' | 'pending_approval' | 'approved' | 'superseded'}
            canEdit={canEdit}
            currentUserIsPresident={isPresident}
            currentUserId={user.id}
            items={declItems}
            approvals={((approvals || []) as Array<{ president_id: string; signature: string | null }>).map((a) => ({
              presidentId: a.president_id,
              hasSignature: Boolean(a.signature),
              source: 'portal'
            }))}
            presidents={presidents}
          />
        );
      } else if (canEdit) {
        quarterlySection = (
          <section className="hq-panel hq-surface-muted">
            <div className="hq-block-head">
              <h3>{quarterState.quarter} re-declaration</h3>
              <span className="hq-inline-note">window open</span>
            </div>
            <p className="helper">
              Quarterly-locked sub-budgets need new amounts for {quarterState.quarter}. Open the declaration to set and
              sign them.
            </p>
            <form action={openQuarterDeclarationAction} className="button-row">
              <button className="button" type="submit">
                Open {quarterState.quarter} declaration
              </button>
            </form>
          </section>
        );
      }
    }
  }

  const planSection = plan
    ? await renderPlan(plan, { canEdit, isPresident, userId: user.id, teams, presidents })
    : null;

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">{canEdit ? 'Admin' : isPresident ? 'President' : 'Financial officer'}</p>
          <h1 className="hq-page-title">Budget plan</h1>
          <p className="hq-subtitle">{setup.message}</p>
        </div>
        <div className="hq-page-head-action">
          <Link href="/dashboard/finances" className="button-secondary">
            ← Manage finances
          </Link>
        </div>
      </section>

      {!plan ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h3>{targetYear} budget</h3>
            <span className="hq-inline-note">no plan yet</span>
          </div>
          {canEdit && setup.setupState !== 'upcoming' ? (
            <>
              <p className="helper">
                Start the {targetYear} budget plan. You&apos;ll add funding sources and per-team category sub-budgets,
                then send it to both presidents to sign.
              </p>
              <form action={createBudgetPlanAction} className="button-row">
                <input type="hidden" name="academic_year" value={targetYear} />
                <button className="button" type="submit">
                  Create {targetYear} budget plan
                </button>
              </form>
            </>
          ) : (
            <p className="empty-note">
              {setup.setupState === 'upcoming'
                ? `Budget setup for ${targetYear} opens on ${formatDateLabel(setup.openAt)}.`
                : `No budget plan exists for ${targetYear} yet.`}
            </p>
          )}
        </section>
      ) : (
        planSection
      )}

      {quarterlySection}
    </div>
  );
}

async function renderPlan(
  plan: { id: string; academicYear: string; version: number; status: 'draft' | 'pending_approval' | 'approved' | 'superseded' },
  ctx: {
    canEdit: boolean;
    isPresident: boolean;
    userId: string;
    teams: Array<{ id: string; name: string }>;
    presidents: Array<{ id: string; fullName: string }>;
  }
) {
  const [{ sources, expenses, allocations, approvals }, rollup] = await Promise.all([
    getPlanBundle(plan.id),
    computePlanRollup(plan.id, plan.academicYear)
  ]);

  const sourceProps = sources.map((source) => {
    const r = rollup.perSource.get(source.id);
    return {
      id: source.id,
      label: source.label,
      kind: source.kind,
      category: source.category,
      notes: source.notes,
      amountCents: source.amountCents,
      isDefaultPool: source.isDefaultPool,
      sortOrder: source.sortOrder,
      committedCents: r?.committedCents || 0,
      remainingCents: r?.remainingCents ?? source.amountCents
    };
  });
  const expenseProps = expenses.map((expense) => {
    const r = rollup.perExpense.get(expense.id);
    return {
      id: expense.id,
      kind: expense.kind,
      teamId: expense.teamId,
      parentId: expense.parentId,
      category: expense.category,
      label: expense.label,
      amountCents: expense.amountCents,
      lockCadence: expense.lockCadence,
      sortOrder: expense.sortOrder,
      effectiveCents: r?.effectiveCents ?? expense.amountCents,
      allocatedCents: r?.allocatedCents || 0,
      remainderFromGrantCents: r?.remainderFromGrantCents || 0,
      spentCents: r?.spentCents || 0
    };
  });

  return (
    <section className="hq-panel hq-surface-muted">
      <BudgetPlanEditor
        planId={plan.id}
        academicYear={plan.academicYear}
        status={plan.status}
        version={plan.version}
        canEdit={ctx.canEdit}
        currentUserIsPresident={ctx.isPresident}
        currentUserId={ctx.userId}
        sources={sourceProps}
        expenses={expenseProps}
        allocations={allocations.map((a) => ({ id: a.id, sourceId: a.sourceId, expenseId: a.expenseId, amountCents: a.amountCents }))}
        teams={ctx.teams}
        approvals={approvals.map((a) => ({ presidentId: a.presidentId, hasSignature: a.hasSignature, source: a.source }))}
        presidents={ctx.presidents}
        totalFundingCents={rollup.totalFundingCents}
        totalExpenseCents={rollup.totalExpenseCents}
        uncoveredCents={rollup.uncoveredCents}
      />
    </section>
  );
}
