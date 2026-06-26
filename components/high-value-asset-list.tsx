'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { formatDateLabel } from '@/lib/academic-calendar';
import { deleteHighValueAssetAction } from '@/app/dashboard/actions';

// Remove button that disables while the delete is in flight (no double-submit).
function RemoveAssetButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="hq-inline-link hq-inline-link-danger"
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? 'Removing…' : 'Remove'}
    </button>
  );
}

export type HighValueAssetView = {
  id: string;
  teamName: string;
  itemName: string;
  amountCents: number;
  locationLabel: string;
  loggedByName: string;
  createdAt: string;
  stewardshipNote: string;
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(cents / 100);
}

// Collapsible read-only table of logged high value capital equipment. Shown on
// the lead dashboard (their own team) and on the privileged dashboard (every
// team, with the Team column enabled via showTeam).
export function HighValueAssetList({
  title,
  assets,
  showTeam = false,
  canManage = false
}: {
  title: string;
  assets: HighValueAssetView[];
  showTeam?: boolean;
  canManage?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="hq-panel hq-surface-muted">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
          color: 'inherit'
        }}
      >
        <span>
          <strong style={{ display: 'block' }}>
            {title} ({assets.length})
          </strong>
          <small className="helper">Capital equipment over $1,000 tracked for stewardship.</small>
        </span>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        assets.length > 0 ? (
          <div style={{ marginTop: '1rem', overflowX: 'auto' }}>
            <table className="hq-table">
              <thead>
                <tr>
                  <th>Date</th>
                  {showTeam ? <th>Steward</th> : null}
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Storage</th>
                  <th>Logged by</th>
                  {canManage ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>{formatDateLabel(new Date(asset.createdAt))}</td>
                    {showTeam ? <td>{asset.teamName}</td> : null}
                    <td>
                      <strong style={{ display: 'block' }}>{asset.itemName}</strong>
                      <small className="helper">{asset.stewardshipNote}</small>
                    </td>
                    <td>{formatCurrency(asset.amountCents)}</td>
                    <td>{asset.locationLabel}</td>
                    <td>{asset.loggedByName}</td>
                    {canManage ? (
                      <td>
                        <form
                          action={deleteHighValueAssetAction}
                          onSubmit={(event) => {
                            if (!window.confirm(`Remove "${asset.itemName}" from the asset register?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="asset_id" value={asset.id} />
                          <RemoveAssetButton />
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-note" style={{ marginTop: '1rem' }}>
            No high value assets logged yet.
          </p>
        )
      ) : null}
    </section>
  );
}
