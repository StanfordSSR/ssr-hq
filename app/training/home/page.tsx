import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingLogoutButton } from '@/app/training/home/logout-button';
import { getTrainingSession } from '@/lib/training-auth';

export default async function TrainingMemberHomePage() {
  const session = await getTrainingSession();

  if (!session) {
    redirect('/training/login');
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Signed in</p>
            <h1 className="auth-title">Welcome to SSR training</h1>
            <p className="auth-subtitle">
              You&apos;re signed in as <strong>{session.email}</strong>. Trainings will appear here once admins publish them.
            </p>
            <TrainingLogoutButton />
          </div>

          <div className="home-card">
            <div className="home-card-row">
              <span>Trainings</span>
              <strong>Coming soon</strong>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
