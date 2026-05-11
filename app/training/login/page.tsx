import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingLoginForm } from '@/app/training/login/login-form';
import { getTrainingSession } from '@/lib/training-auth';

export default async function TrainingLoginPage() {
  const session = await getTrainingSession();
  if (session) {
    redirect('/training/home');
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Training login</p>
            <h1 className="auth-title">Sign in to training</h1>
            <p className="auth-subtitle">
              Enter the email your team lead used when adding you to the roster. We&apos;ll send you a 6-digit code.
            </p>
            <Link className="text-link" href="/training">
              Back
            </Link>
          </div>

          <div className="auth-card">
            <TrainingLoginForm />
          </div>
        </section>
      </main>
    </>
  );
}
