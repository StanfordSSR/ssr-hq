import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingVerifyForm } from '@/app/training/verify/verify-form';
import { getTrainingSession } from '@/lib/training-auth';

export default async function TrainingVerifyPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const session = await getTrainingSession();
  if (session) {
    redirect('/training/home');
  }

  const { email } = await searchParams;

  if (!email) {
    redirect('/training/login');
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Training login</p>
            <h1 className="auth-title">Enter your code</h1>
            <p className="auth-subtitle">
              We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
            <Link className="text-link" href="/training/login">
              Use a different email
            </Link>
          </div>

          <div className="auth-card">
            <TrainingVerifyForm email={email} />
          </div>
        </section>
      </main>
    </>
  );
}
