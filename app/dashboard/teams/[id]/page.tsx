import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { getCurrentAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { getReceiptTaskState } from '@/lib/purchases';
import { getSummerSpendSummary } from '@/lib/summer-spend';
import { getHighValueAssetsForTeams, storageLocationLabel } from '@/lib/high-value-assets';
import { EOY_REPORT_TITLE } from '@/lib/eoy-report';
import { HubTabs } from '@/components/hub-tabs';
import { PurchaseLedger, type PurchaseLedgerRow } from '@/components/purchase-ledger';
import { HighValueAssetPanel } from '@/components/high-value-asset-panel';
import { type HighValueAssetView } from '@/components/high-value-asset-list';

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  amount_cents: number;
  purchased_at: string;
  academic_year: string;
  description: string | null;
  person_name: string | null;
  payment_method: 'reimbursement' | 'credit_card' | 'amazon' | 'unknown';
  category: 'equipment' | 'food' | 'travel' | 'registration';
  receipt_path: string | null;
  receipt_not_needed: boolean;
};

type ReimbursementRow = {
  id: string;
  submitter_name: string;
  item_name: string;
  amount_cents: number;
  reimbursement_number: string;
  status: 'pending' | 'approved' | 'rejected';
  requires_signature: boolean;
  created_at: string;
};

type ReportRow = {
  id: string;
  academic_year: string;
  quarter: string;
  status: 'draft' | 'submitted';
  submitted_at: string | null;
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// One page per team: everything about a single team — budget, people, money,
// reports, equipment — as tabs, instead of scattered across the portal. Purely
// additive: every panel here also still exists in its original home.
export default async function TeamHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teamId } = await params;
  const { user, profile, currentRole } = await getViewerContext();

  const isOfficer =
    currentRole === 'admin' ||
    currentRole === 'president' ||
    currentRole === 'vice_president' ||
    currentRole === 'financial_officer';

  const myLeadTeamIds = await getLeadTeamIds(user.id);
  const isLeadOfTeam = myLeadTeamIds.includes(teamId);

  if (!isOfficer && !isLeadOfTeam) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  const cycle = await getCurrentAcademicYear();

  const [
    { data: teamData },
    { data: budgetData },
    { data: purchasesData },
    { data: membershipsData },
    { data: rosterData },
    { data: reimbursementsData },
    { data: reportsData },
    { data: eoyData },
    assets,
    summerSummary
  ] = await Promise.all([
    admin
      .from('teams')
      .select('id, name, description, logo_url, is_active, created_at')
      .eq('id', teamId)
      .maybeSingle(),
    admin
      .from('team_budgets')
      .select('annual_budget_cents')
      .eq('team_id', teamId)
      .eq('academic_year', cycle)
      .maybeSingle(),
    admin
      .from('purchase_logs')
      .select(
        'id, amount_cents, purchased_at, academic_year, description, person_name, payment_method, category, receipt_path, receipt_not_needed'
      )
      .eq('team_id', teamId)
      .eq('expense_type', 'team')
      .order('purchased_at', { ascending: false })
      .limit(1000),
    admin
      .from('team_memberships')
      .select('user_id, team_role')
      .eq('team_id', teamId)
      .eq('is_active', true),
    admin
      .from('team_roster_members')
      .select('id, full_name, stanford_email, joined_month, joined_year')
      .eq('team_id', teamId)
      .order('full_name'),
    admin
      .from('member_reimbursements')
      .select('id, submitter_name, item_name, amount_cents, reimbursement_number, status, requires_signature, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .limit(100),
    admin
      .from('team_reports')
      .select('id, academic_year, quarter, status, submitted_at')
      .eq('team_id', teamId)
      .order('academic_year', { ascending: false }),
    admin
      .from('eoy_reports')
      .select('id, academic_year, status')
      .eq('team_id', teamId)
      .order('academic_year', { ascending: false }),
    getHighValueAssetsForTeams([teamId]),
    getSummerSpendSummary(cycle)
  ]);

  const team = teamData as TeamRow | null;
  if (!team) {
    redirect(isOfficer ? '/dashboard/teams' : '/dashboard');
  }

  const purchases = (purchasesData || []) as PurchaseRow[];
  const memberships = (membershipsData || []) as Array<{ user_id: string; team_role: 'lead' | 'member' }>;
  const roster = (rosterData || []) as Array<{
    id: string;
    full_name: string;
    stanford_email: string;
    joined_month: number;
    joined_year: number;
  }>;
  const reimbursements = (reimbursementsData || []) as ReimbursementRow[];
  const reports = (reportsData || []) as ReportRow[];
  const eoyReports = (eoyData || []) as Array<{ id: string; academic_year: string; status: string }>;

  // Profiles for leads/members and asset loggers, now that we know the ids.
  const membershipUserIds = Array.from(new Set(memberships.map((m) => m.user_id)));
  const assetLoggerIds = Array.from(
    new Set(assets.map((asset) => asset.logged_by).filter((v): v is string => Boolean(v)))
  );
  const profileIds = Array.from(new Set([...membershipUserIds, ...assetLoggerIds]));
  const { data: profilesData } = profileIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', profileIds)
    : { data: [] };
  const profileById = new Map(
    ((profilesData || []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [p.id, p])
  );

  const leads = memberships
    .filter((m) => m.team_role === 'lead')
    .map((m) => profileById.get(m.user_id))
    .filter((p): p is { id: string; full_name: string | null; email: string | null } => Boolean(p));
  const portalMembers = memberships
    .filter((m) => m.team_role === 'member')
    .map((m) => profileById.get(m.user_id))
    .filter((p): p is { id: string; full_name: string | null; email: string | null } => Boolean(p));

  // Budget math for the current cycle.
  const annualBudgetCents = budgetData?.annual_budget_cents || 0;
  const cycleSpentCents = purchases
    .filter((p) => p.academic_year === cycle)
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const remainingCents = annualBudgetCents - cycleSpentCents;
  const utilizationPercent =
    annualBudgetCents > 0 ? Math.min(100, Math.round((cycleSpentCents / annualBudgetCents) * 100)) : 0;
  const summerRow = summerSummary.teams.find((row) => row.teamId === teamId) || null;

  // Receipts owed: credit card purchases with no receipt on file.
  const receiptsOwed = purchases
    .filter((p) => p.payment_method === 'credit_card' && !p.receipt_path && !p.receipt_not_needed)
    .map((p) => ({
      ...p,
      state: getReceiptTaskState({
        paymentMethod: p.payment_method,
        purchasedAt: p.purchased_at,
        receiptPath: p.receipt_path,
        receiptNotNeeded: p.receipt_not_needed
      })
    }));

  const pendingReimbursements = reimbursements.filter((r) => r.status === 'pending');

  const ledgerRows: PurchaseLedgerRow[] = purchases.map((p) => ({
    id: p.id,
    teamName: team.name,
    description: p.description || 'Untitled purchase',
    amountCents: p.amount_cents,
    purchasedAt: p.purchased_at,
    personName: p.person_name || 'Unknown',
    paymentMethod: p.payment_method || 'unknown',
    category: p.category || 'equipment'
  }));

  const assetViews: HighValueAssetView[] = assets.map((asset) => ({
    id: asset.id,
    teamName: team.name,
    itemName: asset.item_name,
    amountCents: asset.amount_cents,
    locationLabel: storageLocationLabel(asset.storage_location, asset.storage_location_other),
    loggedByName: (asset.logged_by && profileById.get(asset.logged_by)?.full_name) || 'Unknown',
    createdAt: asset.created_at,
    stewardshipNote: asset.stewardship_note
  }));

  const isAdmin = currentRole === 'admin';
  const canLogAssets = isAdmin || currentRole === 'president' || currentRole === 'vice_president' || isLeadOfTeam;

  const overviewTab = (
    <div className="hq-lead-block">
      <div className="hq-finance-metric-grid" style={{ marginTop: 16 }}>
        <div className="hq-finance-metric-card">
          <span>Annual budget</span>
          <strong>{money(annualBudgetCents)}</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>Spent · {cycle}</span>
          <strong>{money(cycleSpentCents)}</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>Remaining</span>
          <strong style={remainingCents < 0 ? { color: '#8c1515' } : undefined}>{money(remainingCents)}</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>Utilization</span>
          <strong>{utilizationPercent}%</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>People</span>
          <strong>{leads.length + portalMembers.length + roster.length}</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>Pending reimbursements</span>
          <strong>{pendingReimbursements.length}</strong>
        </div>
        <div className="hq-finance-metric-card">
          <span>Receipts owed</span>
          <strong style={receiptsOwed.some((r) => r.state.overdue) ? { color: '#8c1515' } : undefined}>
            {receiptsOwed.length}
          </strong>
        </div>
        {summerRow ? (
          <div className="hq-finance-metric-card">
            <span>Summer remaining</span>
            <strong style={summerRow.remainingCents < 0 ? { color: '#8c1515' } : undefined}>
              {money(summerRow.remainingCents)}
            </strong>
          </div>
        ) : null}
      </div>

      <div className="hq-budget-row-meta" style={{ marginTop: 18, maxWidth: 480 }}>
        <div className="hq-budget-meta-line">
          <span>Budget used</span>
          <strong>{utilizationPercent}%</strong>
        </div>
        <div className="hq-budget-progress">
          <div className="hq-budget-progress-fill" style={{ width: `${utilizationPercent}%` }} />
        </div>
      </div>

      <section className="hq-lead-block" style={{ marginTop: 24 }}>
        <div className="hq-block-head">
          <h3>Recent purchases</h3>
        </div>
        {purchases.length === 0 ? (
          <p className="empty-note">No purchases logged yet.</p>
        ) : (
          <div className="hq-summary-list">
            {purchases.slice(0, 5).map((p) => (
              <div key={p.id} className="hq-summary-row">
                <span>{formatDateLabel(new Date(p.purchased_at))}</span>
                <strong>{p.description || 'Untitled purchase'}</strong>
                <strong>{money(p.amount_cents)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const peopleTab = (
    <div className="hq-lead-block">
      <section style={{ marginTop: 16 }}>
        <div className="hq-block-head">
          <h3>Leads ({leads.length})</h3>
          {isOfficer && currentRole !== 'financial_officer' ? (
            <Link href="/dashboard/teams" className="hq-inline-link">
              Manage leads
            </Link>
          ) : null}
        </div>
        {leads.length === 0 ? (
          <p className="empty-note">No active leads assigned.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 700 }}>{lead.full_name || '—'}</td>
                    <td>{lead.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {portalMembers.length > 0 ? (
        <section style={{ marginTop: 22 }}>
          <div className="hq-block-head">
            <h3>Portal members ({portalMembers.length})</h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {portalMembers.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 700 }}>{member.full_name || '—'}</td>
                    <td>{member.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section style={{ marginTop: 22 }}>
        <div className="hq-block-head">
          <h3>Roster ({roster.length})</h3>
          {isLeadOfTeam || (isOfficer && currentRole !== 'financial_officer') ? (
            <Link href="/dashboard/members" className="hq-inline-link">
              Manage roster
            </Link>
          ) : null}
        </div>
        {roster.length === 0 ? (
          <p className="empty-note">No roster members recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Stanford email</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((member) => (
                  <tr key={member.id}>
                    <td style={{ fontWeight: 700 }}>{member.full_name}</td>
                    <td>{member.stanford_email}</td>
                    <td>
                      {new Date(member.joined_year, member.joined_month - 1).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );

  const moneyTab = (
    <div className="hq-lead-block">
      <section style={{ marginTop: 16 }}>
        <div className="hq-block-head">
          <h3>Pending reimbursements ({pendingReimbursements.length})</h3>
          <Link href="/dashboard/reimbursements" className="hq-inline-link">
            Open reimbursements
          </Link>
        </div>
        {pendingReimbursements.length === 0 ? (
          <p className="empty-note">Nothing waiting for a decision.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Person</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Granted #</th>
                </tr>
              </thead>
              <tbody>
                {pendingReimbursements.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateLabel(new Date(r.created_at))}</td>
                    <td>{r.submitter_name}</td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td>
                      {money(r.amount_cents)}
                      {r.requires_signature ? <span className="hq-inline-note"> · needs signature</span> : null}
                    </td>
                    <td>{r.reimbursement_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {receiptsOwed.length > 0 ? (
        <section style={{ marginTop: 22 }}>
          <div className="hq-block-head">
            <h3>Receipts owed ({receiptsOwed.length})</h3>
          </div>
          <div className="hq-summary-list">
            {receiptsOwed.map((p) => (
              <div key={p.id} className="hq-summary-row">
                <span style={p.state.overdue ? { color: '#8c1515' } : undefined}>
                  {p.state.overdue ? 'Overdue' : 'Pending'}
                </span>
                <strong>{p.description || 'Untitled purchase'}</strong>
                <strong>{formatDateLabel(new Date(p.purchased_at))}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div style={{ marginTop: 22 }}>
        <PurchaseLedger rows={ledgerRows} showTeam={false} title={`${team.name} purchases`} />
      </div>
    </div>
  );

  const reportsTab = (
    <div className="hq-lead-block">
      <section style={{ marginTop: 16 }}>
        <div className="hq-block-head">
          <h3>Quarterly reports</h3>
          <Link href="/dashboard/reports" className="hq-inline-link">
            Open reports
          </Link>
        </div>
        {reports.length === 0 ? (
          <p className="empty-note">No quarterly reports yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cycle</th>
                  <th>Quarter</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.academic_year}</td>
                    <td style={{ fontWeight: 700 }}>{report.quarter}</td>
                    <td>{report.status === 'submitted' ? 'Submitted' : 'Draft'}</td>
                    <td>{report.submitted_at ? formatDateLabel(new Date(report.submitted_at)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginTop: 22 }}>
        <div className="hq-block-head">
          <h3>{EOY_REPORT_TITLE}</h3>
          <Link href="/dashboard/reports/eoy" className="hq-inline-link">
            Open year-end report
          </Link>
        </div>
        {eoyReports.length === 0 ? (
          <p className="empty-note">No year-end reports yet.</p>
        ) : (
          <div className="hq-summary-list">
            {eoyReports.map((report) => (
              <div key={report.id} className="hq-summary-row">
                <span>{report.academic_year}</span>
                <strong>{report.status === 'submitted' ? 'Submitted' : 'Draft'}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const equipmentTab = (
    <div className="hq-lead-block" style={{ marginTop: 16 }}>
      <HighValueAssetPanel
        teams={[{ id: team.id, name: team.name }]}
        loggedByName={profile.full_name || ''}
        initialAssets={assetViews}
        canManage={isAdmin}
        canLog={canLogAssets}
        listTitle={`${team.name} high value equipment`}
      />
    </div>
  );

  return (
    <div className="hq-page">
      <section className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Team</p>
          <div className="hq-team-title-row">
            {team.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo_url} alt="" className="hq-team-logo hq-team-logo-large" />
            ) : (
              <div className="hq-team-logo hq-team-logo-large hq-team-logo-fallback">{team.name.slice(0, 1)}</div>
            )}
            <h1 className="hq-page-title">{team.name}</h1>
          </div>
          <p className="hq-subtitle">
            {team.description || 'Budget, people, purchases, reports, and equipment for this team — all in one place.'}
          </p>
        </div>
        {isOfficer && currentRole !== 'financial_officer' ? (
          <div className="hq-page-head-action">
            <Link href="/dashboard/teams" className="button-secondary">
              All teams
            </Link>
          </div>
        ) : null}
      </section>

      <section className="hq-panel hq-surface-muted">
        <HubTabs
          initialTab="overview"
          tabs={[
            { id: 'overview', label: 'Overview', content: overviewTab },
            { id: 'people', label: 'People', content: peopleTab },
            { id: 'money', label: 'Money', content: moneyTab },
            { id: 'reports', label: 'Reports', content: reportsTab },
            { id: 'equipment', label: 'Equipment', content: equipmentTab }
          ]}
        />
      </section>
    </div>
  );
}
