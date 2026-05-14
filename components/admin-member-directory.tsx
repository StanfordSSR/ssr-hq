'use client';

import { useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { deletePortalLeadInlineAction, setPortalUserPasswordInlineAction } from '@/app/dashboard/actions';

type AdminMemberRow = {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  role: string;
  permissions: string;
  teams: string;
  accessLabel?: string;
  accessDetail?: string;
  canDeletePortal?: boolean;
  canManagePassword?: boolean;
};

type AdminMemberDirectoryProps = {
  rows: AdminMemberRow[];
};

export function AdminMemberDirectory({ rows }: AdminMemberDirectoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tableRows, setTableRows] = useState(rows);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<'delete' | 'password' | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [confirmationName, setConfirmationName] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordConfirmValue, setPasswordConfirmValue] = useState('');
  const [isPending, startTransition] = useTransition();

  const showStatus = (status: 'success' | 'error', message: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', status);
    params.set('message', message);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const handleDelete = (formData: FormData) => {
    startTransition(async () => {
      const result = await deletePortalLeadInlineAction(formData);
      if (!result.ok || !result.data) {
        showStatus('error', result.message);
        return;
      }

      setTableRows((current) => current.filter((row) => row.profileId !== result.data!.leadId));
      setExpandedId(null);
      setExpandedMode(null);
      setConfirmationPhrase('');
      setConfirmationName('');
      showStatus('success', result.message);
    });
  };

  const handlePasswordSet = (formData: FormData) => {
    startTransition(async () => {
      const result = await setPortalUserPasswordInlineAction(formData);
      if (!result.ok) {
        showStatus('error', result.message);
        return;
      }

      setExpandedId(null);
      setExpandedMode(null);
      setPasswordValue('');
      setPasswordConfirmValue('');
      showStatus('success', result.message);
    });
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Perms</th>
            <th>Team</th>
            <th>Portal</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => {
            const expanded = expandedId === row.id;

            return (
              <>
                <tr key={row.id}>
                  <td style={{ fontWeight: 700 }}>{row.name}</td>
                  <td>{row.email}</td>
                  <td>{row.role}</td>
                  <td>
                    {row.accessLabel ? (
                      <div className="hq-member-access">
                        <strong className={row.accessLabel === 'Active' ? 'hq-member-access-on' : 'hq-member-access-off'}>
                          {row.accessLabel === 'Active' ? '✓' : '○'} {row.accessLabel}
                        </strong>
                        {row.accessDetail ? <span>{row.accessDetail}</span> : null}
                      </div>
                    ) : (
                      <span className="hq-member-static-note">No portal</span>
                    )}
                  </td>
                  <td>{row.permissions}</td>
                  <td>{row.teams}</td>
                  <td>
                    {row.canDeletePortal && row.profileId ? (
                      <div className="hq-inline-editor-actions">
                        {row.canManagePassword ? (
                          <button
                            className="hq-inline-link"
                            type="button"
                            onClick={() => {
                              setExpandedId(expanded && expandedMode === 'password' ? null : row.id);
                              setExpandedMode(expanded && expandedMode === 'password' ? null : 'password');
                              setPasswordValue('');
                              setPasswordConfirmValue('');
                            }}
                          >
                            Set password
                          </button>
                        ) : null}
                        <button
                          className="hq-inline-link hq-inline-link-danger"
                          type="button"
                          onClick={() => {
                            setExpandedId(expanded && expandedMode === 'delete' ? null : row.id);
                            setExpandedMode(expanded && expandedMode === 'delete' ? null : 'delete');
                            setConfirmationPhrase('');
                            setConfirmationName('');
                          }}
                        >
                          Remove lead
                        </button>
                      </div>
                    ) : (
                      row.canManagePassword && row.profileId ? (
                        <button
                          className="hq-inline-link"
                          type="button"
                          onClick={() => {
                            setExpandedId(expanded && expandedMode === 'password' ? null : row.id);
                            setExpandedMode(expanded && expandedMode === 'password' ? null : 'password');
                            setPasswordValue('');
                            setPasswordConfirmValue('');
                          }}
                        >
                          Set password
                        </button>
                      ) : <span className="hq-member-static-note">No action</span>
                    )}
                  </td>
                </tr>

                {expanded && expandedMode === 'delete' && row.canDeletePortal && row.profileId ? (
                  <tr key={`${row.id}-confirm`}>
                    <td colSpan={7}>
                      <form action={handleDelete} className="hq-admin-delete-form">
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
                            disabled={isPending || confirmationPhrase !== 'DELETE' || confirmationName !== row.name}
                          >
                            {isPending ? 'Removing...' : 'Confirm removal'}
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : null}

                {expanded && expandedMode === 'password' && row.canManagePassword && row.profileId ? (
                  <tr key={`${row.id}-password`}>
                    <td colSpan={7}>
                      <form action={handlePasswordSet} className="hq-admin-delete-form">
                        <input type="hidden" name="profile_id" value={row.profileId} />
                        <input type="hidden" name="password" value={passwordValue} />
                        <input type="hidden" name="password_confirm" value={passwordConfirmValue} />
                        <p className="hq-roster-delete-copy">
                          Set a new password for <strong>{row.name}</strong>. This updates their portal login immediately.
                        </p>
                        <div className="hq-admin-delete-grid">
                          <input
                            className="input"
                            type="password"
                            placeholder="New password"
                            value={passwordValue}
                            onChange={(event) => setPasswordValue(event.target.value)}
                          />
                          <input
                            className="input"
                            type="password"
                            placeholder="Confirm password"
                            value={passwordConfirmValue}
                            onChange={(event) => setPasswordConfirmValue(event.target.value)}
                          />
                          <button
                            className="button-secondary"
                            type="submit"
                            disabled={isPending || passwordValue.length < 8 || passwordValue !== passwordConfirmValue}
                          >
                            {isPending ? 'Saving...' : 'Save password'}
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
