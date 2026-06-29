import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewerContext, profileHasFinancialOfficerRole } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getPendingCardAgreements } from '@/lib/credit-card';

export default async function CreditCardApprovalsPage() {
  const { profile, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isFinancialOfficer =
    currentRole === 'financial_officer' || profileHasFinancialOfficerRole(profile);

  if (!isAdmin && !isFinancialOfficer) {
    redirect('/dashboard');
  }

  const pending = await getPendingCardAgreements();

  return (
    <div className="hq-page">
      <div className="hq-page-head">
        <div className="hq-page-head-copy">
          <p className="hq-eyebrow">Finances</p>
          <h1 className="hq-page-title">Credit card access requests</h1>
          <p className="hq-subtitle">
            Members who signed the credit card agreement and are waiting for approval.
          </p>
        </div>
      </div>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h2>Pending review ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <p className="empty-note">No pending credit card access requests.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Signed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((request) => (
                  <tr key={request.userId}>
                    <td style={{ fontWeight: 700 }}>{request.fullName || 'Unknown'}</td>
                    <td>{request.teamName || '—'}</td>
                    <td>{formatDateLabel(new Date(request.signedAt))}</td>
                    <td>
                      <Link
                        className="hq-inline-link"
                        href={`/dashboard/credit-card/approve/${request.userId}`}
                      >
                        Review &amp; approve
                      </Link>
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
}
