import Link from 'next/link';
import { Header } from '@/components/header';
import {
  formatAgreementDate,
  getAgreementByContractToken,
  isAgreementExpired
} from '@/lib/visitor-agreements';
import { VisitorContractForm } from '@/app/visit/[token]/visitor-contract-form';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Visitor access agreement — Stanford Student Robotics'
};

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-card">
            <h1 className="auth-title">{title}</h1>
            <p className="helper">{message}</p>
            <Link className="text-link" href="/">
              Back to home
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

export default async function VisitorContractPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const agreement = await getAgreementByContractToken(token);

  if (!agreement) {
    return <Notice title="Link not found" message="This access link isn't valid or has expired." />;
  }
  if (isAgreementExpired(agreement.access_end)) {
    return (
      <Notice
        title="Access link expired"
        message="This access link has expired. Ask your SSR contact to send you a new one."
      />
    );
  }
  if (agreement.status === 'signed') {
    return (
      <Notice
        title="Already completed"
        message="This agreement has already been completed. If you need your badge again, check the email you received when you signed."
      />
    );
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <VisitorContractForm
          token={token}
          issuerName={agreement.issuer_name}
          accessStart={formatAgreementDate(agreement.access_start)}
          accessEnd={formatAgreementDate(agreement.access_end)}
        />
      </main>
    </>
  );
}
