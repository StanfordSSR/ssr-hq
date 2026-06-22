'use client';

import { useMemo, useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';
import { ACKNOWLEDGEMENTS, VisitorContractBody } from '@/components/visitor-contract-body';

// 18 years ago today, as a YYYY-MM-DD string, for the date input's max.
function maxDobValue(): string {
  const now = new Date();
  const d = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isAtLeast18(dob: string): boolean {
  if (!dob) return false;
  const birth = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 18;
}

export function VisitorContractForm({
  token,
  issuerName,
  accessStart,
  accessEnd
}: {
  token: string;
  issuerName: string;
  accessStart: string;
  accessEnd: string;
}) {
  const [fullName, setFullName] = useState('');
  const [university, setUniversity] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [acks, setAcks] = useState<boolean[]>(() => ACKNOWLEDGEMENTS.map(() => false));
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ badgeUrl: string } | null>(null);

  const dobOk = useMemo(() => isAtLeast18(dob), [dob]);
  const allAcked = acks.every(Boolean);
  const fieldsFilled = Boolean(
    fullName.trim() && university.trim() && dob && email.trim() && phone.trim()
  );
  const canSubmit = fieldsFilled && dobOk && allAcked && Boolean(signature);

  const toggleAck = (index: number, checked: boolean) => {
    setAcks((prev) => prev.map((value, i) => (i === index ? checked : value)));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!fieldsFilled) {
      setError('Please fill in every field above.');
      return;
    }
    if (!dobOk) {
      setError('You must be at least 18 years old to sign this agreement.');
      return;
    }
    if (!allAcked) {
      setError('Please check all seven acknowledgments before signing.');
      return;
    }
    if (!signature) {
      setError('Draw your signature at the end of the agreement.');
      return;
    }

    setSubmitting(true);
    const clientMeta = {
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenW: window.screen?.width,
      screenH: window.screen?.height,
      platform: (navigator as { platform?: string }).platform ?? null,
      userAgent: navigator.userAgent
    };
    try {
      const response = await fetch(`/api/visit/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          university: university.trim(),
          dob,
          email: email.trim(),
          phone: phone.trim(),
          acknowledgements: acks,
          signature,
          strokes,
          client_meta: clientMeta
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data?.error || 'Could not submit. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone({ badgeUrl: data.badgeUrl });
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  };

  if (done) {
    const firstName = fullName.trim().split(/\s+/)[0] || 'visitor';
    return (
      <section className="page-shell" style={{ maxWidth: 720, margin: '0 auto', padding: '1rem 0' }}>
        <div className="form-stack" style={{ lineHeight: 1.7 }}>
          <h1 style={{ marginBottom: 0 }}>Thank you, {firstName}.</h1>
          <p className="helper">Your access agreement is complete.</p>
          <a className="button" href={done.badgeUrl} target="_blank" rel="noopener noreferrer">
            Open your visitor badge
          </a>
          <p className="helper">
            We&apos;ve also emailed this link to you. It works until {accessEnd}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <article
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '1rem 0 3rem',
        lineHeight: 1.75,
        color: '#231f20'
      }}
    >
      <VisitorContractBody issuerName={issuerName} accessStart={accessStart} accessEnd={accessEnd} />

      <form className="form-stack" onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
        {/* Participant information */}
        <div className="field">
          <label className="label" htmlFor="visitor-name">
            Full legal name
          </label>
          <input
            className="input"
            id="visitor-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="visitor-university">
            Affiliated university
          </label>
          <input
            className="input"
            id="visitor-university"
            value={university}
            onChange={(event) => setUniversity(event.target.value)}
            placeholder="e.g. UC Berkeley"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="visitor-dob">
            Date of birth
          </label>
          <input
            className="input"
            id="visitor-dob"
            type="date"
            value={dob}
            max={maxDobValue()}
            onChange={(event) => setDob(event.target.value)}
            required
          />
          {dob && !dobOk ? (
            <span className="helper" style={{ color: '#8c1515' }}>
              You must be at least 18 years old to sign this agreement.
            </span>
          ) : (
            <span className="helper">You must be at least 18 years old.</span>
          )}
        </div>

        <div className="field">
          <label className="label" htmlFor="visitor-email">
            Email
          </label>
          <input
            className="input"
            id="visitor-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="visitor-phone">
            Phone number
          </label>
          <input
            className="input"
            id="visitor-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            required
          />
        </div>

        {/* Participant acknowledgments — interactive checkboxes for §15 above. */}
        <section style={{ marginTop: '0.5rem' }}>
          <h2
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              margin: '0 0 0.5rem',
              color: '#171414'
            }}
          >
            Confirm the §15 acknowledgments
          </h2>
          <p style={{ margin: '0 0 0.6rem' }}>
            Check each statement to confirm it. All are required.
          </p>
          <div className="form-stack" style={{ gap: '0.6rem' }}>
            {ACKNOWLEDGEMENTS.map((text, index) => (
              <label
                key={index}
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                  border: `1.5px solid ${acks[index] ? '#8c1515' : '#e0d4d4'}`,
                  borderRadius: 8,
                  padding: '0.6rem 0.75rem',
                  background: acks[index] ? '#fbeeee' : '#ffffff'
                }}
              >
                <input
                  type="checkbox"
                  checked={acks[index]}
                  onChange={(event) => toggleAck(index, event.target.checked)}
                  style={{ marginTop: '0.25rem', flexShrink: 0 }}
                  required
                />
                <span>{text}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Signature */}
        <div className="field" style={{ marginTop: '1.5rem' }}>
          <label className="label">Sign here to accept this Agreement.</label>
          <SignaturePad
            value={signature}
            onChange={setSignature}
            onStrokesChange={setStrokes}
            actionLabel="Sign the agreement"
            title="Sign to accept this Agreement"
            description="Draw your signature below using your mouse, trackpad, or finger to accept this Agreement."
            altText="Participant signature"
          />
          <span className="helper">
            Your IP address and a timestamp are recorded when you sign.
          </span>
        </div>

        <button className="button" type="submit" disabled={submitting || !canSubmit}>
          {submitting ? 'Submitting…' : 'Accept and submit'}
        </button>

        {error ? (
          <p className="helper" style={{ color: '#8c1515' }}>
            {error}
          </p>
        ) : (
          <p className="helper">
            By submitting you confirm you have read and agree to this Agreement, valid through{' '}
            {accessEnd}.
          </p>
        )}
      </form>
    </article>
  );
}
