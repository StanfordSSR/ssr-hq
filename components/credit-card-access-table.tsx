import type { CardAccessRow } from '@/lib/credit-card';

function formatStamp(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function Yes({ when }: { when: string | null }) {
  return (
    <span style={{ color: '#1f7a4d', fontWeight: 700 }}>
      ✓{when ? <span style={{ fontWeight: 400, color: '#6d6161' }}> · {when}</span> : null}
    </span>
  );
}

function No() {
  return <span style={{ color: '#8c1515', fontWeight: 700 }}>✗</span>;
}

// Read-only table of everyone granted card access: agreement signed, FO signed
// (or admin override), and last access time. Shown to admin/president (settings)
// and financial officers (approvals page).
export function CreditCardAccessTable({ rows }: { rows: CardAccessRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-note">No one has been granted credit card access yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Person</th>
            <th>Agreement signed</th>
            <th>FO approved</th>
            <th>Last access</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.userId}>
              <td style={{ fontWeight: 700 }}>{row.fullName}</td>
              <td>{row.agreementSigned ? <Yes when={formatStamp(row.agreementSignedAt)} /> : <No />}</td>
              <td>
                {row.foApproved ? (
                  <Yes when={formatStamp(row.foSignedAt)} />
                ) : row.overridden ? (
                  <span style={{ color: '#8a6d1f', fontWeight: 700 }}>
                    ✓<span style={{ fontWeight: 400, color: '#6d6161' }}> · admin override{row.overriddenAt ? ` · ${formatStamp(row.overriddenAt)}` : ''}</span>
                  </span>
                ) : (
                  <No />
                )}
              </td>
              <td>{formatStamp(row.lastAccessAt) || <span className="hq-member-static-note">Never</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
