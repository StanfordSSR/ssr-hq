import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewerContext, profileHasFinancialOfficerRole } from '@/lib/auth';
import { formatDateLabel } from '@/lib/academic-calendar';
import { getPendingCardAgreements, getPendingRegionApprovals, getCardAccessOverview } from '@/lib/credit-card';
import { ApproveCardRegionButton } from '@/components/approve-card-region-button';
import { CreditCardAccessTable } from '@/components/credit-card-access-table';

function formatRegion(country: string | null, region: string | null, regionKey: string) {
  if (country && region) return `${region}, ${country}`;
  if (country) return country;
  return regionKey;
}

export default async function CreditCardApprovalsPage() {
  const { profile, currentRole } = await getViewerContext();
  const isAdmin = currentRole === 'admin';
  const isFinancialOfficer =
    currentRole === 'financial_officer' || profileHasFinancialOfficerRole(profile);

  if (!isAdmin && !isFinancialOfficer) {
    redirect('/dashboard');
  }

  const [pending, pendingRegions, accessOverview] = await Promise.all([
    getPendingCardAgreements(),
    getPendingRegionApprovals(),
    getCardAccessOverview()
  ]);

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

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h2>Location approvals ({pendingRegions.length})</h2>
        </div>
        <p className="helper">
          The card is only viewable from California by default. These users tried to view it from a new
          location and need a Financial Officer to approve that location.
        </p>
        {pendingRegions.length === 0 ? (
          <p className="empty-note">No pending location approvals.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Location</th>
                  <th>Requested</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendingRegions.map((request) => (
                  <tr key={`${request.userId}-${request.regionKey}`}>
                    <td style={{ fontWeight: 700 }}>{request.fullName || 'Unknown'}</td>
                    <td>{formatRegion(request.country, request.region, request.regionKey)}</td>
                    <td>{formatDateLabel(new Date(request.requestedAt))}</td>
                    <td>
                      <ApproveCardRegionButton userId={request.userId} regionKey={request.regionKey} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="hq-panel hq-surface-muted">
        <div className="hq-block-head">
          <h2>Card access overview</h2>
        </div>
        <p className="helper">
          Everyone granted access, whether they signed the agreement, whether the financial officer approved
          it, and when they last viewed the card.
        </p>
        <CreditCardAccessTable rows={accessOverview} />
      </section>
    </div>
  );
}
