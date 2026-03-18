'use client';

import { useState } from 'react';
import { deletePortalLeadAction } from '@/app/dashboard/actions';

type AdminMemberRow = {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  role: string;
  permissions: string;
  teams: string;
  canDeletePortal?: boolean;
};

type AdminMemberDirectoryProps = {
  rows: AdminMemberRow[];
};

export function AdminMemberDirectory({ rows }: AdminMemberDirectoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [confirmationName, setConfirmationName] = useState('');

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Perms</th>
            <th>Team</th>
            <th>Portal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = expandedId === row.id;

            return (
              <>
                <tr key={row.id}>
                  <td style={{ fontWeight: 700 }}>{row.name}</td>
                  <td>{row.email}</td>
                  <td>{row.role}</td>
                  <td>{row.permissions}</td>
                  <td>{row.teams}</td>
                  <td>
                    {row.canDeletePortal && row.profileId ? (
                      <button
                        className="hq-inline-link hq-inline-link-danger"
                        type="button"
                        onClick={() => {
                          setExpandedId(expanded ? null : row.id);
                          setConfirmationPhrase('');
                          setConfirmationName('');
                        }}
                      >
                        Remove lead
                      </button>
                    ) : (
                      <span className="hq-member-static-note">No action</span>
                    )}
                  </td>
                </tr>

                {expanded && row.canDeletePortal && row.profileId ? (
                  <tr key={`${row.id}-confirm`}>
                    <td colSpan={6}>
                      <form action={deletePortalLeadAction} className="hq-admin-delete-form">
                        <input type="hidden" name="lead_id" value={row.profileId} />
                        <input type="hidden" name="confirmation_phrase" value={confirmationPhrase} />
                        <input type="hidden" name="confirmation_name" value={confirmationName} />
                        <p className="hq-roster-delete-copy">
                          Type <strong>DELETE</strong> and then <strong>{row.name}</strong> to remove this lead from the portal and delete their account.
                        </p>
                        <div className="hq-admin-delete-grid">
                          <input
                            className="input"
                            placeholder="DELETE"
                            value={confirmationPhrase}
                            onChange={(event) => setConfirmationPhrase(event.target.value)}
                          />
                          <input
                            className="input"
                            placeholder={row.name}
                            value={confirmationName}
                            onChange={(event) => setConfirmationName(event.target.value)}
                          />
                          <button
                            className="button-secondary"
                            type="submit"
                            disabled={confirmationPhrase !== 'DELETE' || confirmationName !== row.name}
                          >
                            Confirm removal
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
