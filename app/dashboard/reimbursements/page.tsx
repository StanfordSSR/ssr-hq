import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase-admin';
import { getViewerContext } from '@/lib/auth';
import { getLeadTeamIds } from '@/lib/lead-state';
import { getReceiptLinks } from '@/lib/receipt-workflow';
import { formatDateLabel } from '@/lib/academic-calendar';
import { FinanceFileToggle, PortalDecideButtons } from '@/components/reimbursement-actions';

type ReimbursementRow = {
  id: string;
  team_id: string;
  submitter_name: string;
  item_name: string;
  amount_cents: number;
  reimbursement_number: string;
  receipt_path: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requires_signature: boolean;
  approval_kind: 'button' | 'signature' | null;
  decided_at: string | null;
  decided_by_profile_id: string | null;
  finance_processed_at: string | null;
  decision_token: string;
  off_campus_ack: boolean;
  created_at: string;
};

function money(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function ReimbursementsPage() {
  const { user, currentRole } = await getViewerContext();
  const isFinance =
    currentRole === 'admin' ||
    currentRole === 'president' ||
    currentRole === 'vice_president' ||
    currentRole === 'financial_officer';
  // Marking a reimbursement filed in Granted is a finance WRITE action. Vice
  // presidents get the same read-only finance VIEW as presidents, but cannot
  // perform this write (the server action also rejects them).
  const canFileReimbursements =
    currentRole === 'admin' || currentRole === 'president' || currentRole === 'financial_officer';
  const isLead = currentRole === 'team_lead';

  if (!isFinance && !isLead) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();
  let query = admin
    .from('member_reimbursements')
    .select(
      'id, team_id, submitter_name, item_name, amount_cents, reimbursement_number, receipt_path, status, requires_signature, approval_kind, decided_at, decided_by_profile_id, finance_processed_at, decision_token, off_campus_ack, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  // The teams this viewer actually leads — the only ones they can approve for,
  // regardless of any finance/president role they also hold.
  const myLeadTeamIds = await getLeadTeamIds(user.id);
  if (!isFinance) {
    if (myLeadTeamIds.length === 0) {
      redirect('/dashboard');
    }
    query = query.in('team_id', myLeadTeamIds);
  }

  const leadTeamSet = new Set(myLeadTeamIds);
  const { data: rowsData } = await query;
  const rows = (rowsData || []) as ReimbursementRow[];

  const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
  const deciderIds = Array.from(
    new Set(rows.map((r) => r.decided_by_profile_id).filter((v): v is string => Boolean(v)))
  );
  const [{ data: teamsData }, { data: decidersData }, receiptLinks] = await Promise.all([
    teamIds.length ? admin.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] }),
    deciderIds.length
      ? admin.from('profiles').select('id, full_name').in('id', deciderIds)
      : Promise.resolve({ data: [] }),
    getReceiptLinks(rows.map((r) => r.receipt_path))
  ]);

  const teamName = new Map((teamsData || []).map((t) => [t.id, t.name]));
  const deciderName = new Map((decidersData || []).map((p) => [p.id, p.full_name]));

  const pending = rows.filter((r) => r.status === 'pending');
  const approvedToFile = rows.filter((r) => r.status === 'approved' && !r.finance_processed_at);
  const history = rows.filter(
    (r) => r.status === 'rejected' || (r.status === 'approved' && r.finance_processed_at)
  );

  return (
    <div className="hq-page">
      <div className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Finances</p>
          <h1 className="hq-page-title">Reimbursements</h1>
          <p className="hq-subtitle">
            {isFinance
              ? 'Member-submitted reimbursements approved by team leads. File the approved ones in the Stanford Granted portal using their R-codes, then mark them filed.'
              : 'Reimbursements your team members submitted. Approve or reject — approved purchases are logged to your budget.'}
          </p>
        </div>
      </div>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h2>Pending approval ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <p className="empty-note">Nothing waiting for a decision.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Team</th>
                  <th>Person</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Granted #</th>
                  <th>Receipt</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDateLabel(new Date(r.created_at))}</td>
                    <td>{teamName.get(r.team_id) || '—'}</td>
                    <td>
                      {r.submitter_name}
                      {r.off_campus_ack ? (
                        <span className="hq-inline-note" title="Submitted from outside the Bay Area; submitter acknowledged the off-campus policy.">
                          {' '}⚠ off-campus
                        </span>
                      ) : null}
                    </td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td>
                      {money(r.amount_cents)}
                      {r.requires_signature ? (
                        <span className="hq-inline-note"> · needs signature</span>
                      ) : null}
                    </td>
                    <td>{r.reimbursement_number}</td>
                    <td>{receiptLinks.get(r.receipt_path || '') ? (
                      <a href={receiptLinks.get(r.receipt_path || '')} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      '—'
                    )}</td>
                    <td>
                      {leadTeamSet.has(r.team_id) ? (
                        <PortalDecideButtons
                          id={r.id}
                          requiresSignature={r.requires_signature}
                          token={r.decision_token}
                        />
                      ) : (
                        <span className="hq-inline-note">Awaiting team lead</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isFinance ? (
        <section className="hq-panel hq-surface-muted">
          <div className="hq-block-head">
            <h2>Approved — ready for Granted ({approvedToFile.length})</h2>
          </div>
          {approvedToFile.length === 0 ? (
            <p className="empty-note">No approved reimbursements waiting to be filed.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Approved</th>
                    <th>Team</th>
                    <th>Person</th>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Granted #</th>
                    <th>Approved by</th>
                    <th>Receipt</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {approvedToFile.map((r) => (
                    <tr key={r.id}>
                      <td>{r.decided_at ? formatDateLabel(new Date(r.decided_at)) : '—'}</td>
                      <td>{teamName.get(r.team_id) || '—'}</td>
                      <td>{r.submitter_name}</td>
                      <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                      <td>{money(r.amount_cents)}</td>
                      <td style={{ fontWeight: 700 }}>{r.reimbursement_number}</td>
                      <td>
                        {r.decided_by_profile_id ? deciderName.get(r.decided_by_profile_id) || '—' : '—'}
                        {r.approval_kind === 'signature' ? <span className="hq-inline-note"> · signed</span> : null}
                      </td>
                      <td>
                        {receiptLinks.get(r.receipt_path || '') ? (
                          <a href={receiptLinks.get(r.receipt_path || '')} target="_blank" rel="noreferrer">
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {canFileReimbursements ? <FinanceFileToggle id={r.id} processed={false} /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h2>History ({history.length})</h2>
        </div>
        {history.length === 0 ? (
          <p className="empty-note">No decided reimbursements yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Decided</th>
                  <th>Team</th>
                  <th>Person</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Granted #</th>
                  <th>Status</th>
                  {isFinance ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td>{r.decided_at ? formatDateLabel(new Date(r.decided_at)) : '—'}</td>
                    <td>{teamName.get(r.team_id) || '—'}</td>
                    <td>{r.submitter_name}</td>
                    <td style={{ fontWeight: 700 }}>{r.item_name}</td>
                    <td>{money(r.amount_cents)}</td>
                    <td>{r.reimbursement_number}</td>
                    <td>
                      {r.status === 'rejected'
                        ? 'Rejected'
                        : r.finance_processed_at
                          ? 'Filed in Granted'
                          : 'Approved'}
                    </td>
                    {isFinance ? (
                      <td>
                        {canFileReimbursements && r.status === 'approved' && r.finance_processed_at ? (
                          <FinanceFileToggle id={r.id} processed={true} />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
