import Link from 'next/link';
import {
  formatAgreementDate,
  getAgreementByBadgeToken,
  isAgreementExpired
} from '@/lib/visitor-agreements';
import { VisitorBadge } from '@/app/badge/[token]/visitor-badge';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Visitor badge — Stanford Student Robotics'
};

export default async function VisitorBadgePage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const agreement = await getAgreementByBadgeToken(token);

  if (
    !agreement ||
    agreement.status !== 'signed' ||
    !agreement.participant_name ||
    isAgreementExpired(agreement.access_end)
  ) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#120606',
          color: '#f5ecec',
          padding: '2rem',
          textAlign: 'center'
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>Badge not found or expired.</h1>
          <p style={{ color: '#c9a9a9', marginBottom: '1.25rem' }}>
            This visitor badge is no longer valid.
          </p>
          <Link href="/" style={{ color: '#f0b6b6' }}>
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <VisitorBadge
      name={agreement.participant_name}
      accessEnd={formatAgreementDate(agreement.access_end)}
      issuerName={agreement.issuer_name}
    />
  );
}
