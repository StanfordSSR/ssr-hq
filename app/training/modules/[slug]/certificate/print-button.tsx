'use client';

export function CertificatePrintButton() {
  return (
    <button type="button" className="button-secondary" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
