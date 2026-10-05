'use client';

import { Fragment, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  deletePortalLeadInlineAction,
  resendPortalInviteInlineAction,
  setPortalUserPasswordInlineAction
} from '@/app/dashboard/actions';
import { confirmationMatches } from '@/lib/confirmation';

// Module scope so the clock read stays out of the component body.
function writeFlashCookie(status: 'success' | 'error', message: string) {
  document.cookie = `hq_flash=${encodeURIComponent(
    JSON.stringify({ status, message, ts: Date.now() })
  )}; path=/; max-age=20; samesite=lax`;
}

type AdminMemberRow = {
  id: string;
  profileId?: string;
  name: string;
  email: string;
  role: string;
  permissions: string;
  permissionCodes: string;
  teams: string;
  accessLabel?: string;
  accessDetail?: string;
  canDeletePortal?: boolean;
  canManagePassword?: boolean;
  canResendInvite?: boolean;
  signatureEnrolled?: boolean;
};

type AdminMemberDirectoryProps = {
  rows: AdminMemberRow[];
};

export function AdminMemberDirectory({ rows }: AdminMemberDirectoryProps) {
  const router = useRouter();
  const [tableRows, setTableRows] = useState(rows);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<'delete' | 'password' | null>(null);
  const [confirmationPhrase, setConfirmationPhrase] = useState('');
  const [confirmationName, setConfirmationName] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordConfirmValue, setPasswordConfirmValue] = useState('');
  const [isPending, startTransition] = useTransition();

  // Feed the global ActionToast the same way server actions do: a short-lived
  // hq_flash cookie, then refresh so the layout re-reads it. (This used to push
  // ?status=&message= into the URL, which nothing renders any more.)
  const showStatus = (status: 'success' | 'error', message: string) => {
    writeFlashCookie(status, message);
    router.refresh();
  };

  const handleResendInvite = (row: AdminMemberRow) => {
    if (!row.profileId) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set('profile_id', row.profileId as string);
      formData.set('email', row.email);
      const result = await resendPortalInviteInlineAction(formData);
      showStatus(result.ok ? 'success' : 'error', result.message);
    });
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
    <div className="table-wrap hq-member-table-wrap">
      <table className="hq-member-table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Role</th>
            <th>Status</th>
            <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }} title="Signature enrolled">
              Sig
            </th>
            <th title="A: admin; C: club-wide; F: finance; L: team lead; R: recorded member">Perms</th>
            <th>Team</th>
            <th>Portal</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => {
            const expanded = expandedId === row.id;

            return (
              <Fragment key={row.id}>
                <tr key={row.id}>
                  <td data-label="Member" className="hq-member-identity">
                    <strong>{row.name}</strong>
                    <span title={row.email}>{row.email}</span>
                  </td>
                  <td data-label="Role" className="hq-member-role" title={row.role}>{row.role}</td>
                  <td data-label="Status">
                    {row.accessLabel ? (
                      <span
                        className={row.accessLabel === 'Active' ? 'hq-member-access-on' : 'hq-member-access-off'}
                        title={row.accessDetail}
                        aria-label={`${row.accessLabel}. ${row.accessDetail || ''}`}
                        tabIndex={0}
                      >{row.accessLabel}</span>
                    ) : (
                      <span className="hq-member-static-note">No portal</span>
                    )}
                  </td>
                  <td data-label="Signature" style={{ textAlign: 'center' }}>
                    {row.signatureEnrolled === undefined ? (
                      <span className="hq-member-static-note">—</span>
                    ) : row.signatureEnrolled ? (
                      <span className="hq-member-access-on" title="Signature enrolled" style={{ fontWeight: 700 }}>
                        ✓
                      </span>
                    ) : (
                      <span className="hq-member-access-off" title="No signature enrolled" style={{ fontWeight: 700 }}>
                        ✗
                      </span>
                    )}
                  </td>
                  <td data-label="Permissions">
                    <span className="hq-member-permissions" title={row.permissions} aria-label={row.permissions} tabIndex={0}>
                      {row.permissionCodes}
                    </span>
                  </td>
                  <td data-label="Team" className="hq-member-team" title={row.teams}>{row.teams}</td>
                  <td data-label="Portal">
                    {row.profileId && (row.canResendInvite || row.canManagePassword || row.canDeletePortal) ? (
                      <div className="hq-inline-editor-actions">
                        {row.canResendInvite ? (
                          <button
                            className="hq-inline-link"
                            type="button"
                            disabled={isPending}
                            onClick={() => handleResendInvite(row)}
                            title="Their invite link expired or was lost — email a fresh one"
                          >
                            {isPending ? 'Sending…' : 'Resend invite'}
                          </button>
                        ) : null}

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

                        {row.canDeletePortal ? (
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
                        ) : null}
                      </div>
                    ) : (
                      <span className="hq-member-static-note">No action</span>
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
                          Type <strong>DELETE</strong> and then <strong>{row.name}</strong> (or their email) to remove this lead from the portal and delete their account.
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
                            disabled={
                              isPending ||
                              confirmationPhrase !== 'DELETE' ||
                              !confirmationMatches(confirmationName, { fullName: row.name, email: row.email })
                            }
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
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
