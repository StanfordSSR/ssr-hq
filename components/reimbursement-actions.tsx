'use client';

import { useActionState } from 'react';
import {
  decideReimbursementInPortalAction,
  setReimbursementProcessedAction
} from '@/app/dashboard/reimbursements/actions';

const initial = { ok: false, message: '' };

export function FinanceFileToggle({ id, processed }: { id: string; processed: boolean }) {
  const [state, formAction, pending] = useActionState(setReimbursementProcessedAction, initial);
  return (
    <form action={formAction} className="hq-inline-form">
      <input type="hidden" name="reimbursement_id" value={id} />
      <input type="hidden" name="processed" value={processed ? 'false' : 'true'} />
      <button className={processed ? 'button-secondary' : 'button'} type="submit" disabled={pending}>
        {pending ? '…' : processed ? 'Reopen' : 'Mark filed in Granted'}
      </button>
      {state.message && !state.ok ? <span className="helper" style={{ color: '#8c1515' }}>{state.message}</span> : null}
    </form>
  );
}

export function PortalDecideButtons({
  id,
  requiresSignature,
  token
}: {
  id: string;
  requiresSignature: boolean;
  token: string;
}) {
  const [state, formAction, pending] = useActionState(decideReimbursementInPortalAction, initial);

  if (requiresSignature) {
    return (
      <a className="button-secondary" href={`/approve-reimbursement/${token}`} target="_blank" rel="noreferrer">
        Sign to approve →
      </a>
    );
  }

  return (
    <div className="form-stack" style={{ gap: '0.4rem' }}>
      <div className="button-row">
        <form action={formAction} className="hq-inline-form">
          <input type="hidden" name="reimbursement_id" value={id} />
          <input type="hidden" name="decision" value="approved" />
          <button className="button" type="submit" disabled={pending}>
            Approve
          </button>
        </form>
        <form action={formAction} className="hq-inline-form">
          <input type="hidden" name="reimbursement_id" value={id} />
          <input type="hidden" name="decision" value="rejected" />
          <button className="button-secondary" type="submit" disabled={pending}>
            Reject
          </button>
        </form>
      </div>
      {state.message && !state.ok ? (
        <span className="helper" style={{ color: '#8c1515' }}>
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
