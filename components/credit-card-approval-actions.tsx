'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import type { SignatureStroke } from '@/lib/signature-verify';
import {
  approveCreditCardAgreementAction,
  overrideCreditCardAgreementAction
} from '@/app/dashboard/actions';

// The Financial Officer's sign-to-approve control. The FO draws their OWN
// enrolled signature; it's verified server-side before access is granted.
// Submit stays disabled until a signature has been drawn.
export function CreditCardApprovePanel({ userId }: { userId: string }) {
  const [signature, setSignature] = useState('');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);

  return (
    <form action={approveCreditCardAgreementAction} className="form-stack">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="signature" value={signature} />
      <input type="hidden" name="strokes" value={JSON.stringify(strokes)} />

      <div className="field">
        <label className="label">Sign to approve access</label>
        <SignaturePad
          value={signature}
          onChange={setSignature}
          onStrokesChange={setStrokes}
          actionLabel="Draw signature"
          title="Approve with your signature"
          description="Draw your enrolled signature to approve this credit card access request."
          altText="Financial officer approval signature"
        />
        <span className="helper">
          Your signature is checked against your enrolled profile before access is granted.
        </span>
      </div>

      <button className="button" type="submit" disabled={!signature}>
        Approve access
      </button>
    </form>
  );
}

// The admin's override control: grants access without an FO signature, behind a
// confirm dialog.
export function CreditCardOverrideButton({ userId }: { userId: string }) {
  return (
    <form
      action={overrideCreditCardAgreementAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            'Grant credit card access now, without a Financial Officer signature? This overrides the approval step.'
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button className="button-secondary" type="submit">
        Override — grant access without FO signature
      </button>
    </form>
  );
}
