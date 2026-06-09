'use client';

import { useActionState, useState } from 'react';
import { SignaturePad } from '@/components/signature-pad';
import {
  enrollSignatureAction,
  resetSignatureEnrollmentAction,
  testSignatureAction
} from '@/app/dashboard/actions';
import { MIN_ENROLL_SAMPLES, type SignatureStroke } from '@/lib/signature-verify';

export function SignatureEnrollment({ enrolled, sampleCount }: { enrolled: boolean; sampleCount: number }) {
  const [samples, setSamples] = useState<SignatureStroke[][]>([]);
  const [testStrokes, setTestStrokes] = useState<SignatureStroke[]>([]);
  const [testResult, runTest] = useActionState(testSignatureAction, { ok: false, message: '' });
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
          {`Capture at least ${MIN_ENROLL_SAMPLES} signatures so the portal can verify it's really you when you sign approvals. Sign each one the natural way you normally would.`}
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

      {enrolled ? (
        <div className="hq-sig-test form-stack">
          <h4 className="hq-team-label">Test your signature</h4>
          <p className="helper">Sign below and check whether it matches your enrolled signature.</p>
          <SignaturePad
            value=""
            onChange={() => {}}
            onStrokesChange={setTestStrokes}
            actionLabel="Sign to test"
            title="Test your signature"
            description="Sign the way you normally would, then check the match."
            altText="Test signature"
          />
          <form action={runTest} className="button-row">
            <input type="hidden" name="strokes" value={JSON.stringify(testStrokes)} />
            <button className="button-secondary" type="submit" disabled={testStrokes.length === 0}>
              Check match
            </button>
          </form>
          {testResult.message ? (
            <p className={testResult.ok ? 'helper hq-sig-match' : 'helper hq-sig-nomatch'}>{testResult.message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
