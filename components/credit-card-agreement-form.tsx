'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';
import { signCreditCardAgreementAction } from '@/app/dashboard/actions';

// The granted user's signing control. Captures the drawn signature (PNG value +
// timed strokes) and posts them as hidden fields to the redirecting server
// action, which verifies the signature against the user's enrolled profile and
// routes the request to the Financial Officer. Submit stays disabled until a
// signature has been drawn.
export function CreditCardAgreementForm() {
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  return (
    <form action={signCreditCardAgreementAction} className="form-stack" style={{ marginTop: '1.5rem' }}>
      <input type="hidden" name="signature" value={signature} />
      <input type="hidden" name="strokes" value={JSON.stringify(strokes)} />

      <div className="field">
        <label className="label">Sign to accept this Agreement</label>
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

      <button className="button" type="submit" disabled={!signature}>
        Sign and request access
      </button>
    </form>
  );
}
