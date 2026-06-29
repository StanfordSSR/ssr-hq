'use client';

import { useEffect, useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';
import { signCreditCardAgreementAction } from '@/app/dashboard/actions';

// Minimum time (seconds) a user must spend on the page before they can sign, so
// they actually read the agreement rather than scrolling straight to the bottom.
const MIN_READ_SECONDS = 120;

// The granted user's signing control. Captures the drawn signature (PNG value +
// timed strokes) and posts them as hidden fields to the redirecting server
// action, which verifies the signature against the user's enrolled profile and
// routes the request to the Financial Officer. Submit stays disabled until both
// the minimum reading time has elapsed and a signature has been drawn.
export function CreditCardAgreementForm({ readToken }: { readToken: string }) {
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(MIN_READ_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const readingDone = secondsLeft <= 0;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const countdown = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <form action={signCreditCardAgreementAction} className="form-stack" style={{ marginTop: '1.5rem' }}>
      <input type="hidden" name="signature" value={signature} />
      <input type="hidden" name="strokes" value={JSON.stringify(strokes)} />
      <input type="hidden" name="read_token" value={readToken} />

      <div className="field">
        <label className="label">Sign to accept this Agreement</label>
        {!readingDone ? (
          <p
            className="helper"
            style={{
              fontWeight: 600,
              color: '#8a5a00',
              border: '1px solid #e0c08a',
              background: '#fdf6e8',
              borderRadius: 8,
              padding: '0.6rem 0.8rem',
              margin: '0 0 0.75rem'
            }}
          >
            Please take time to read the full agreement. You can sign in{' '}
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{countdown}</strong>.
          </p>
        ) : null}
        <SignaturePad
          value={signature}
          onChange={setSignature}
          onStrokesChange={setStrokes}
          actionLabel="Sign the agreement"
          title="Sign to accept this Agreement"
          description="Draw your enrolled signature below using your mouse, trackpad, or finger."
          altText="Authorized user signature"
        />
        <span className="helper">
          Your signature is verified against your enrolled signature, then sent to the Financial
          Officer for approval.
        </span>
      </div>

      <button className="button" type="submit" disabled={!signature || !readingDone}>
        {readingDone ? 'Sign and request access' : `Available in ${countdown}`}
      </button>
    </form>
  );
}
