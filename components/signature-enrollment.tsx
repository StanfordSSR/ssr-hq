'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import { enrollSignatureAction, resetSignatureEnrollmentAction } from '@/app/dashboard/actions';
import { MIN_ENROLL_SAMPLES, type SignatureStroke } from '@/lib/signature-verify';

export function SignatureEnrollment({ enrolled, sampleCount }: { enrolled: boolean; sampleCount: number }) {
  const [samples, setSamples] = useState<SignatureStroke[][]>([]);
  const enough = samples.length >= MIN_ENROLL_SAMPLES;

  return (
    <div className="form-stack">
      {enrolled ? (
        <p className="helper">
          ✓ A verification signature is enrolled ({sampleCount} reference{sampleCount === 1 ? '' : 's'}). You can re-enroll
          below to replace it.
        </p>
      ) : (
        <p className="helper">
          Capture at least {MIN_ENROLL_SAMPLES} signatures so the portal can verify it&apos;s really you when you sign
          approvals. Sign each one the natural way you normally would.
        </p>
      )}

      <SignaturePad
        value=""
        onChange={() => {}}
        onStrokesChange={(strokes) => {
          if (strokes.length > 0) setSamples((prev) => [...prev, strokes]);
        }}
        actionLabel="Add a reference signature"
        title="Capture a reference signature"
        description="Sign the same way you'll sign approvals. Add a few so we learn your style."
        altText="Reference signature"
      />

      <div className="hq-summary-row">
        <span>Captured references</span>
        <strong className={enough ? '' : 'hq-sheet-warn'}>
          {samples.length} / {MIN_ENROLL_SAMPLES}
        </strong>
      </div>

      <div className="button-row">
        <form action={enrollSignatureAction}>
          <input type="hidden" name="samples" value={JSON.stringify(samples)} />
          <button className="button" type="submit" disabled={!enough}>
            {enrolled ? 'Re-enroll signature' : 'Enroll signature'}
          </button>
        </form>
        {samples.length > 0 ? (
          <button type="button" className="hq-inline-link" onClick={() => setSamples([])}>
            Start over
          </button>
        ) : null}
        {enrolled ? (
          <form action={resetSignatureEnrollmentAction}>
            <button className="hq-inline-link" type="submit">
              Remove enrollment
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
