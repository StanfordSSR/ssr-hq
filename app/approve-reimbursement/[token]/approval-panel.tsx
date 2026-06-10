'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';

type Status = 'pending' | 'approved' | 'rejected';

export function ApprovalPanel({
  token,
  requiresSignature,
  initialStatus
}: {
  token: string;
  requiresSignature: boolean;
  initialStatus: Status;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status === 'approved') {
    return <p className="helper" style={{ color: '#1f7a4d', fontWeight: 600 }}>Approved ✓ — logged to the team budget.</p>;
  }
  if (status === 'rejected') {
    return <p className="helper" style={{ color: '#8c1515', fontWeight: 600 }}>Rejected — nothing was logged.</p>;
  }

  const decide = async (decision: 'approved' | 'rejected') => {
    setError(null);
    if (decision === 'approved' && requiresSignature && strokes.length === 0) {
      setError('Draw your signature above to approve.');
      return;
    }
    setBusy(decision === 'approved' ? 'approve' : 'reject');
    try {
      const response = await fetch('/api/approve-reimbursement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          decision,
          strokes: decision === 'approved' && requiresSignature ? strokes : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data?.status === 'approved' || data?.status === 'rejected') {
          setStatus(data.status);
        }
        setError(data?.error || 'Could not record the decision.');
        setBusy(null);
        return;
      }
      setStatus(decision);
    } catch {
      setError('Network error. Please try again.');
      setBusy(null);
    }
  };

  return (
    <div className="form-stack">
      {requiresSignature ? (
        <div className="field">
          <label className="label">Sign to approve</label>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            onStrokesChange={setStrokes}
            actionLabel="Draw signature"
            title="Approve with your signature"
            description="Draw your enrolled signature to approve this reimbursement."
            altText="Approval signature"
          />
          <span className="helper">
            Your signature is checked against your enrolled profile. Don&apos;t have one? Approve from
            the portal instead.
          </span>
        </div>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button"
          onClick={() => decide('approved')}
          disabled={busy !== null}
        >
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => decide('rejected')}
          disabled={busy !== null}
        >
          {busy === 'reject' ? 'Rejecting…' : 'Reject'}
        </button>
      </div>

      {error ? (
        <p className="helper" style={{ color: '#8c1515' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
