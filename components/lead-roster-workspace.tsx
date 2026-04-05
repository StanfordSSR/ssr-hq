'use client';

import { useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  addTeamRosterMemberInlineAction,
  deleteTeamRosterMemberInlineAction,
  updateTeamRosterMemberInlineAction
} from '@/app/dashboard/actions';

type RosterMember = {
  id: string;
  full_name: string;
  stanford_email: string;
  slack_user_id?: string | null;
  joined_month: number | null;
  joined_year: number | null;
  source: 'lead' | 'recorded';
};

type LeadRosterWorkspaceProps = {
  teamId: string;
  rosterMembers: RosterMember[];
  leadCount: number;
  totalTrackedCount: number;
  monthOptions: string[];
};

type EditingState = {
  memberId: string;
  field: 'full_name' | 'stanford_email' | 'slack_user_id';
} | null;

export function LeadRosterWorkspace({
  teamId,
  rosterMembers,
  leadCount,
  totalTrackedCount,
  monthOptions
}: LeadRosterWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<'add' | 'recorded'>('add');
  const [editing, setEditing] = useState<EditingState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [members, setMembers] = useState(rosterMembers);
  const [isPending, startTransition] = useTransition();
  const addFormRef = useRef<HTMLFormElement | null>(null);
  const nameFormRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const emailFormRefs = useRef<Record<string, HTMLFormElement | null>>({});
  const slackFormRefs = useRef<Record<string, HTMLFormElement | null>>({});

  const recordedMemberCount = members.filter((member) => member.source === 'recorded').length;
  const visibleLeadCount = members.filter((member) => member.source === 'lead').length;
  const visibleTotalTrackedCount = members.length;

  const showStatus = (status: 'success' | 'error', message: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', status);
    params.set('message', message);
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const handleAddSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await addTeamRosterMemberInlineAction(formData);
      if (!result.ok || !result.data) {
        showStatus('error', result.message);
        return;
      }

      setMembers((current) => [...current, result.data!]);
      addFormRef.current?.reset();
      setActiveTab('recorded');
      showStatus('success', result.message);
    });
  };

  const handleUpdateSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateTeamRosterMemberInlineAction(formData);
      if (!result.ok || !result.data) {
        showStatus('error', result.message);
        return;
      }

      setMembers((current) =>
        current.map((member) => (member.id === result.data!.id ? { ...member, ...result.data! } : member))
      );
      setEditing(null);
      showStatus('success', result.message);
    });
  };

  const handleDeleteSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await deleteTeamRosterMemberInlineAction(formData);
      if (!result.ok || !result.data) {
        showStatus('error', result.message);
        return;
      }

      setMembers((current) => current.filter((member) => member.id !== result.data!.memberId));
      setPendingDeleteId(null);
      setDeleteConfirmation('');
      showStatus('success', result.message);
    });
  };

  return (
    <section className="hq-panel hq-lead-main hq-surface-muted">
      <div className="hq-roster-top">
        <section className="hq-lead-block hq-roster-add">
          <div className="hq-block-head">
            <h3>Add member</h3>
          </div>

          <form
            action={handleAddSubmit}
            className="form-stack"
            ref={(node) => {
              addFormRef.current = node;
            }}
          >
            <input type="hidden" name="team_id" value={teamId} />

            <div className="hq-inline-grid hq-inline-grid-roster">
              <div className="field">
                <label className="label" htmlFor="member-full-name">
                  Full name
                </label>
                <input className="input" id="member-full-name" name="full_name" required />
              </div>

              <div className="field">
                <label className="label" htmlFor="member-email">
                  Stanford email
                </label>
                <input className="input" id="member-email" name="stanford_email" type="email" placeholder="sunet@stanford.edu" required />
              </div>

              <div className="field">
                <label className="label" htmlFor="member-slack-user-id">
                  Slack ID
                </label>
                <input className="input" id="member-slack-user-id" name="slack_user_id" placeholder="U0123456789" />
              </div>

              <div className="field">
                <label className="label" htmlFor="joined-month">
                  Joined month
                </label>
                <select className="select" id="joined-month" name="joined_month" defaultValue={String(new Date().getMonth() + 1)}>
                  {monthOptions.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="label" htmlFor="joined-year">
                  Joined year
                </label>
                <input className="input" id="joined-year" name="joined_year" type="number" min="2000" max="2100" defaultValue={new Date().getFullYear()} required />
              </div>
            </div>

            <div className="button-row">
              <button className="button" type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Add member'}
              </button>
            </div>
          </form>
        </section>

        <section className="hq-lead-block hq-roster-tabs">
          <div className="hq-block-head">
            <h3>Roster</h3>
          </div>

          <div className="hq-tab-row">
            <button
              className={`hq-tab-button ${activeTab === 'add' ? 'hq-tab-button-active' : ''}`}
              type="button"
              onClick={() => setActiveTab('add')}
            >
              Add member
            </button>
            <button
              className={`hq-tab-button ${activeTab === 'recorded' ? 'hq-tab-button-active' : ''}`}
              type="button"
              onClick={() => setActiveTab('recorded')}
            >
              Recorded members
            </button>
          </div>

          {activeTab === 'recorded' ? (
            <div className="hq-summary-list">
              <div className="hq-summary-row">
                <span>Lead accounts</span>
                <strong>{visibleLeadCount || leadCount}</strong>
              </div>
              <div className="hq-summary-row">
                <span>Recorded members</span>
                <strong>{recordedMemberCount}</strong>
              </div>
              <div className="hq-summary-row">
                <span>Total tracked</span>
                <strong>{visibleTotalTrackedCount || totalTrackedCount}</strong>
              </div>
            </div>
          ) : (
            <div className="hq-roster-tab-spacer" aria-hidden="true" />
          )}
        </section>
      </div>

      <section className="hq-lead-block hq-roster-list-block">
        <div className="hq-block-head">
          <h3>All recorded members</h3>
          <span className="hq-inline-note">Double-click name, email, or Slack ID to edit</span>
        </div>

        {members.length > 0 ? (
          <div className="hq-roster-grid">
            {members.map((member) => {
              const editingName = editing?.memberId === member.id && editing.field === 'full_name';
              const editingEmail = editing?.memberId === member.id && editing.field === 'stanford_email';
              const editingSlack = editing?.memberId === member.id && editing.field === 'slack_user_id';
              const isLeadAccount = member.source === 'lead';

              return (
                <div key={member.id} className="hq-roster-row">
                  <div className="hq-roster-row-top">
                    <div className="hq-roster-joined">
                      {isLeadAccount
                        ? 'Lead account'
                        : `${monthOptions[(member.joined_month || 1) - 1]} ${member.joined_year}`}
                    </div>

                    {!isLeadAccount ? (
                      <button
                        className="hq-roster-delete-button"
                        type="button"
                        aria-label={`Delete ${member.full_name}`}
                        title="Delete recorded member"
                        onClick={() => {
                          setPendingDeleteId((current) => (current === member.id ? null : member.id));
                          setDeleteConfirmation('');
                        }}
                      >
                        x
                      </button>
                    ) : null}
                  </div>

                  <div className="hq-roster-fields">
                    <form
                      action={handleUpdateSubmit}
                      className="hq-roster-inline-form"
                      ref={(node) => {
                        nameFormRefs.current[member.id] = node;
                      }}
                    >
                      <input type="hidden" name="member_id" value={isLeadAccount ? '' : member.id} />
                      <input type="hidden" name="stanford_email" value={member.stanford_email} />
                      <input type="hidden" name="slack_user_id" value={member.slack_user_id || ''} />
                      {editingName && !isLeadAccount ? (
                        <input
                          className="input hq-roster-inline-input"
                          name="full_name"
                          defaultValue={member.full_name}
                          autoFocus
                          onBlur={(event) => {
                            if (event.currentTarget.value.trim() && event.currentTarget.value.trim() !== member.full_name) {
                              nameFormRefs.current[member.id]?.requestSubmit();
                            } else {
                              setEditing(null);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              nameFormRefs.current[member.id]?.requestSubmit();
                            }
                            if (event.key === 'Escape') {
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <input type="hidden" name="full_name" value={member.full_name} />
                          <button
                            className="hq-roster-inline-text"
                            type="button"
                            onDoubleClick={() => {
                              if (!isLeadAccount) {
                                setEditing({ memberId: member.id, field: 'full_name' });
                              }
                            }}
                            title={isLeadAccount ? 'Lead accounts are managed through portal invites' : 'Double-click to edit'}
                          >
                            {member.full_name}
                          </button>
                        </>
                      )}
                    </form>

                    <form
                      action={handleUpdateSubmit}
                      className="hq-roster-inline-form"
                      ref={(node) => {
                        emailFormRefs.current[member.id] = node;
                      }}
                    >
                      <input type="hidden" name="member_id" value={isLeadAccount ? '' : member.id} />
                      <input type="hidden" name="full_name" value={member.full_name} />
                      <input type="hidden" name="slack_user_id" value={member.slack_user_id || ''} />
                      {editingEmail && !isLeadAccount ? (
                        <input
                          className="input hq-roster-inline-input"
                          name="stanford_email"
                          type="email"
                          defaultValue={member.stanford_email}
                          autoFocus
                          onBlur={(event) => {
                            const value = event.currentTarget.value.trim().toLowerCase();
                            if (value && value !== member.stanford_email) {
                              emailFormRefs.current[member.id]?.requestSubmit();
                            } else {
                              setEditing(null);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              emailFormRefs.current[member.id]?.requestSubmit();
                            }
                            if (event.key === 'Escape') {
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <input type="hidden" name="stanford_email" value={member.stanford_email} />
                          <button
                            className="hq-roster-inline-text hq-roster-inline-text-muted"
                            type="button"
                            onDoubleClick={() => {
                              if (!isLeadAccount) {
                                setEditing({ memberId: member.id, field: 'stanford_email' });
                              }
                            }}
                            title={isLeadAccount ? 'Lead accounts are managed through portal invites' : 'Double-click to edit'}
                          >
                            {member.stanford_email}
                          </button>
                        </>
                      )}
                    </form>

                    <form
                      action={handleUpdateSubmit}
                      className="hq-roster-inline-form"
                      ref={(node) => {
                        slackFormRefs.current[member.id] = node;
                      }}
                    >
                      <input type="hidden" name="member_id" value={isLeadAccount ? '' : member.id} />
                      <input type="hidden" name="full_name" value={member.full_name} />
                      <input type="hidden" name="stanford_email" value={member.stanford_email} />
                      {editingSlack && !isLeadAccount ? (
                        <input
                          className="input hq-roster-inline-input"
                          name="slack_user_id"
                          defaultValue={member.slack_user_id || ''}
                          autoFocus
                          placeholder="No Slack ID"
                          onBlur={(event) => {
                            const value = event.currentTarget.value.trim();
                            if (value !== (member.slack_user_id || '')) {
                              slackFormRefs.current[member.id]?.requestSubmit();
                            } else {
                              setEditing(null);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              slackFormRefs.current[member.id]?.requestSubmit();
                            }
                            if (event.key === 'Escape') {
                              setEditing(null);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <input type="hidden" name="slack_user_id" value={member.slack_user_id || ''} />
                          <button
                            className="hq-roster-inline-text hq-roster-inline-text-muted"
                            type="button"
                            onDoubleClick={() => {
                              if (!isLeadAccount) {
                                setEditing({ memberId: member.id, field: 'slack_user_id' });
                              }
                            }}
                            title={isLeadAccount ? 'Lead accounts sync through portal profiles' : 'Double-click to edit'}
                          >
                            {member.slack_user_id || 'No Slack ID'}
                          </button>
                        </>
                      )}
                    </form>

                    {pendingDeleteId === member.id && !isLeadAccount ? (
                      <form action={handleDeleteSubmit} className="hq-roster-delete-form">
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="confirmation_name" value={deleteConfirmation} />
                        <p className="hq-roster-delete-copy">Type <strong>{member.full_name}</strong> to delete this record.</p>
                        <div className="hq-roster-delete-controls">
                          <input
                            className="input hq-roster-inline-input"
                            value={deleteConfirmation}
                            onChange={(event) => setDeleteConfirmation(event.target.value)}
                            placeholder={member.full_name}
                            autoFocus
                          />
                          <button className="button-secondary" type="submit" disabled={deleteConfirmation !== member.full_name || isPending}>
                            {isPending ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-note">No recorded members yet.</p>
        )}
      </section>
    </section>
  );
}
