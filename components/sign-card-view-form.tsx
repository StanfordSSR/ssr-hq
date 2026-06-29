'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';
import { signCardViewAction } from '@/app/dashboard/actions';

// The monthly / new-location verification control on the secure card page. The
// viewer draws their enrolled signature; it's posted as hidden fields to the
// redirecting server action, which re-checks the view gate and verifies the
// signature before unlocking the card. Submit stays disabled until signed.
export function SignCardViewForm() {
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  return (
    <form action={signCardViewAction} className="form-stack" style={{ marginTop: '1.25rem' }}>
      <input type="hidden" name="strokes" value={JSON.stringify(strokes)} />

      <div className="field">
        <label className="label">Sign to view the card</label>
        <SignaturePad
          value={signature}
          onChange={setSignature}
          onStrokesChange={setStrokes}
          actionLabel="Sign to verify"
          title="Verify to view the card"
          description="Draw your enrolled signature to confirm it's you before the card is shown."
          altText="Card view verification signature"
        />
        <span className="helper">
          Your signature is checked against your enrolled profile before the card is revealed.
        </span>
      </div>

      <button className="button" type="submit" disabled={!signature}>
        Verify and view the card
      </button>
    </form>
  );
}
