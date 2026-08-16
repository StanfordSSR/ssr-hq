import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { getCurrentAcademicYear, formatDateLabel } from '@/lib/academic-calendar';
import { getReceiptTaskState } from '@/lib/purchases';
import { getSummerSpendSummary } from '@/lib/summer-spend';
import { remainingCents, utilizationPercent, sumAmounts } from '@/lib/finance-math';
import { getHighValueAssetsForTeams, storageLocationLabel } from '@/lib/high-value-assets';
import { EOY_REPORT_TITLE } from '@/lib/eoy-report';
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

// One page per team, no tabs: a cardinal masthead, a scoreboard of the numbers
// that matter, then every domain as an expandable section on the same page.
// Purely additive: every panel here also still exists in its original home.
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
  const cycleSpentCents = sumAmounts(purchases.filter((p) => p.academic_year === cycle));
  const remaining = remainingCents(annualBudgetCents, cycleSpentCents);
  const utilization = utilizationPercent(annualBudgetCents, cycleSpentCents);
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
  const overdueReceipts = receiptsOwed.filter((p) => p.state.overdue).length;

  const pendingReimbursements = reimbursements.filter((r) => r.status === 'pending');
  const attentionCount = pendingReimbursements.length + receiptsOwed.length;

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
  const canManagePeople = isOfficer && currentRole !== 'financial_officer';

  const totalPeople = leads.length + portalMembers.length + roster.length;
  const leadNames = leads.map((lead) => lead.full_name).filter(Boolean).join(', ');
  const latestReport = reports[0] || null;
  const latestEoy = eoyReports[0] || null;
  const cyclePurchaseCount = purchases.filter((p) => p.academic_year === cycle).length;

  return (
    <div className="th-page">
      {/* Masthead */}
      <header className="th-mast">
        <div className="th-mast-main">
          <p className="th-mast-eyebrow">Stanford Student Robotics · {cycle}</p>
          <div className="th-mast-title">
            {team.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.logo_url} alt="" className="th-mast-logo" />
            ) : (
              <span className="th-mast-logo th-mast-logo-fallback">{team.name.slice(0, 1)}</span>
            )}
            <h1>{team.name}</h1>
          </div>
          {team.description ? <p className="th-mast-desc">{team.description}</p> : null}
        </div>
        <div className="th-mast-side">
          <span className={`th-status ${team.is_active ? 'th-status-live' : 'th-status-off'}`}>
            {team.is_active ? 'Active' : 'Inactive'}
          </span>
          {isOfficer && currentRole !== 'financial_officer' ? (
            <Link href="/dashboard/teams" className="th-mast-link">
              ← All teams
            </Link>
          ) : null}
        </div>
      </header>

      {/* Scoreboard */}
      <div className="th-stats">
        <div className="th-stat">
          <span>Annual budget</span>
          <strong>{money(annualBudgetCents)}</strong>
        </div>
        <div className="th-stat">
          <span>Spent · {cycle}</span>
          <strong>{money(cycleSpentCents)}</strong>
        </div>
        <div className="th-stat">
          <span>Remaining</span>
          <strong className={remaining < 0 ? 'th-bad' : undefined}>{money(remaining)}</strong>
        </div>
        <div className="th-stat">
          <span>Utilization</span>
          <strong>{utilization}%</strong>
          <div className="th-stat-bar">
            <div style={{ width: `${utilization}%` }} />
          </div>
        </div>
        {summerRow ? (
          <div className="th-stat">
            <span>Summer remaining</span>
            <strong className={summerRow.remainingCents < 0 ? 'th-bad' : undefined}>
              {money(summerRow.remainingCents)}
            </strong>
          </div>
        ) : null}
        <div className="th-stat">
          <span>People</span>
          <strong>{totalPeople}</strong>
        </div>
        <div className="th-stat">
          <span>Pending reimb.</span>
          <strong className={pendingReimbursements.length > 0 ? 'th-warn' : undefined}>
            {pendingReimbursements.length}
          </strong>
        </div>
        <div className="th-stat">
          <span>Receipts owed</span>
          <strong className={overdueReceipts > 0 ? 'th-bad' : receiptsOwed.length > 0 ? 'th-warn' : undefined}>
            {receiptsOwed.length}
          </strong>
        </div>
      </div>

      {/* Needs attention — only when something actually needs it; open by default */}
      {attentionCount > 0 ? (
        <details className="th-section th-section-alert" open>
          <summary>
            <span className="th-sec-label">Needs attention</span>
            <span className="th-sec-preview">
              {pendingReimbursements.length > 0
                ? `${pendingReimbursements.length} reimbursement${pendingReimbursements.length === 1 ? '' : 's'} waiting`
                : ''}
              {pendingReimbursements.length > 0 && receiptsOwed.length > 0 ? ' · ' : ''}
              {receiptsOwed.length > 0
                ? `${receiptsOwed.length} receipt${receiptsOwed.length === 1 ? '' : 's'} owed${overdueReceipts > 0 ? ` (${overdueReceipts} overdue)` : ''}`
                : ''}
            </span>
            <span className="th-sec-count">{attentionCount}</span>
          </summary>
          <div className="th-body">
            {pendingReimbursements.length > 0 ? (
              <div className="th-block">
                <div className="th-block-head">
                  <h3>Pending reimbursements</h3>
                  <Link href="/dashboard/reimbursements" className="th-link">
                    Decide →
                  </Link>
                </div>
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
              </div>
            ) : null}

            {receiptsOwed.length > 0 ? (
              <div className="th-block">
                <div className="th-block-head">
                  <h3>Receipts owed</h3>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Purchase</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receiptsOwed.map((p) => (
                        <tr key={p.id}>
                          <td className={p.state.overdue ? 'th-bad' : undefined} style={{ fontWeight: 700 }}>
                            {p.state.overdue ? 'Overdue' : 'Pending'}
                          </td>
                          <td>{p.description || 'Untitled purchase'}</td>
                          <td>{formatDateLabel(new Date(p.purchased_at))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      {/* Purchases */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Purchases</span>
          <span className="th-sec-preview">
            {cyclePurchaseCount} this cycle · {money(cycleSpentCents)} spent
            {purchases[0]
              ? ` · latest: ${purchases[0].description || 'Untitled'} (${money(purchases[0].amount_cents)})`
              : ''}
          </span>
          <span className="th-sec-count">{purchases.length}</span>
        </summary>
        <div className="th-body">
          <PurchaseLedger rows={ledgerRows} showTeam={false} title={`${team.name} purchases`} />
        </div>
      </details>

      {/* People */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">People</span>
          <span className="th-sec-preview">{leadNames ? `Led by ${leadNames}` : 'No active leads'}</span>
          <span className="th-sec-count">{totalPeople}</span>
        </summary>
        <div className="th-body">
          <div className="th-cols">
            <div className="th-block">
              <div className="th-block-head">
                <h3>Leads ({leads.length})</h3>
                {canManagePeople ? (
                  <Link href="/dashboard/teams" className="th-link">
                    Manage →
                  </Link>
                ) : null}
              </div>
              {leads.length === 0 ? (
                <p className="empty-note">No active leads assigned.</p>
              ) : (
                <div className="table-wrap">
                  <table>
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

              {portalMembers.length > 0 ? (
                <>
                  <div className="th-block-head" style={{ marginTop: 18 }}>
                    <h3>Portal members ({portalMembers.length})</h3>
                  </div>
                  <div className="table-wrap">
                    <table>
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
                </>
              ) : null}
            </div>

            <div className="th-block">
              <div className="th-block-head">
                <h3>Roster ({roster.length})</h3>
                {isLeadOfTeam || canManagePeople ? (
                  <Link href="/dashboard/members" className="th-link">
                    Manage →
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
                        <th>Email</th>
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
            </div>
          </div>
        </div>
      </details>

      {/* Reports */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Reports</span>
          <span className="th-sec-preview">
            {latestReport
              ? `${latestReport.quarter} ${latestReport.academic_year}: ${latestReport.status === 'submitted' ? 'submitted' : 'draft'}`
              : 'No quarterly reports yet'}
            {latestEoy ? ` · Year-end ${latestEoy.academic_year}: ${latestEoy.status}` : ''}
          </span>
          <span className="th-sec-count">{reports.length + eoyReports.length}</span>
        </summary>
        <div className="th-body">
          <div className="th-cols">
            <div className="th-block">
              <div className="th-block-head">
                <h3>Quarterly</h3>
                <Link href="/dashboard/reports" className="th-link">
                  Open →
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
            </div>

            <div className="th-block">
              <div className="th-block-head">
                <h3>{EOY_REPORT_TITLE}</h3>
                <Link href="/dashboard/reports/eoy" className="th-link">
                  Open →
                </Link>
              </div>
              {eoyReports.length === 0 ? (
                <p className="empty-note">No year-end reports yet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {eoyReports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.academic_year}</td>
                          <td style={{ fontWeight: 700 }}>
                            {report.status === 'submitted' ? 'Submitted' : 'Draft'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* Equipment */}
      <details className="th-section">
        <summary>
          <span className="th-sec-label">Equipment</span>
          <span className="th-sec-preview">
            {assets.length > 0
              ? `${assets.length} high value item${assets.length === 1 ? '' : 's'} on record`
              : 'No high value equipment recorded'}
          </span>
          <span className="th-sec-count">{assets.length}</span>
        </summary>
        <div className="th-body">
          <HighValueAssetPanel
            teams={[{ id: team.id, name: team.name }]}
            loggedByName={profile.full_name || ''}
            initialAssets={assetViews}
            canManage={isAdmin}
            canLog={canLogAssets}
            listTitle={`${team.name} high value equipment`}
          />
        </div>
      </details>
    </div>
  );
}
