'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';

// Today and today+7 as YYYY-MM-DD strings for the default access window.
function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Collapsible dashboard panel (admins + presidents) that issues a signed,
// unguessable external-visitor contract link. The president signs to issue it;
// their drawing is verified against their enrolled signature profile.
export function VisitorLinkGenerator() {
  const [open, setOpen] = useState(false);
  const [accessStart, setAccessStart] = useState(() => dateOffset(0));
  const [accessEnd, setAccessEnd] = useState(() => dateOffset(7));
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contractUrl, setContractUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!accessStart || !accessEnd) {
      setError('Pick a start and end date.');
      return;
    }
    if (accessStart > accessEnd) {
      setError('The start date must be on or before the end date.');
      return;
    }
    if (!signature) {
      setError('Draw your signature to issue the link.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/visitor-agreements/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_start: accessStart,
          access_end: accessEnd,
          strokes,
          signature
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Could not create the link. Please try again.');
        setSubmitting(false);
        return;
      }
      setContractUrl(data.contractUrl);
      setSubmitting(false);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  const copyLink = async () => {
    if (!contractUrl) return;
    try {
      await navigator.clipboard.writeText(contractUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setContractUrl(null);
    setSignature('');
    setStrokes([]);
    setError(null);
    setCopied(false);
  };

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
          <strong style={{ display: 'block' }}>Issue a visitor access link</strong>
          <small className="helper">
            Generate a signed contract link for an external visitor to the facilities.
          </small>
        </span>
        <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open ? (
        contractUrl ? (
          <div className="form-stack" style={{ marginTop: '1rem' }}>
            <div className="field">
              <label className="label" htmlFor="visitor-link-output">
                Visitor contract link
              </label>
              <input
                className="input"
                id="visitor-link-output"
                value={contractUrl}
                readOnly
                onFocus={(event) => event.target.select()}
              />
            </div>
            <div className="button-row">
              <button type="button" className="button" onClick={copyLink}>
                {copied ? 'Copied ✓' : 'Copy link'}
              </button>
              <button type="button" className="button-secondary" onClick={reset}>
                Issue another
              </button>
            </div>
            <span className="helper">
              Send this link to your visitor; it opens the contract they must sign.
            </span>
          </div>
        ) : (
          <form className="form-stack" style={{ marginTop: '1rem' }} onSubmit={handleSubmit}>
            <div className="hq-inline-grid">
              <div className="field">
                <label className="label" htmlFor="visitor-access-start">
                  Access start date
                </label>
                <input
                  className="input"
                  id="visitor-access-start"
                  type="date"
                  value={accessStart}
                  onChange={(event) => setAccessStart(event.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="visitor-access-end">
                  Access end date
                </label>
                <input
                  className="input"
                  id="visitor-access-end"
                  type="date"
                  value={accessEnd}
                  onChange={(event) => setAccessEnd(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label className="label">Sign to issue</label>
              <SignaturePad
                value={signature}
                onChange={setSignature}
                onStrokesChange={setStrokes}
                actionLabel="Draw signature"
                title="Sign to issue the visitor link"
                description="Draw your enrolled signature to authorize this visitor access link."
                altText="Issuer signature"
              />
              <span className="helper">You must have a signature enrolled in Personal settings.</span>
            </div>

            <div className="button-row">
              <button className="button" type="submit" disabled={submitting}>
                {submitting ? 'Issuing…' : 'Generate link'}
              </button>
            </div>

            {error ? (
              <p className="helper" style={{ color: '#8c1515' }}>
                {error}
              </p>
            ) : null}
          </form>
        )
      ) : null}
    </section>
  );
}
