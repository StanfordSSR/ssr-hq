import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { getTrainingSession } from '@/lib/training-auth';

export default async function TrainingHomePage() {
  const session = await getTrainingSession();

  if (session) {
    redirect('/training/home');
  }

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="home-shell">
          <div className="home-copy">
            <p className="home-kicker">Member training</p>
            <h1 className="home-title">SSR Training</h1>
            <p className="auth-subtitle">
              Required trainings for everyone in Stanford Student Robotics. Sign in with the email your team lead used when adding you to the roster.
            </p>

            <div className="button-row">
              <Link className="button-primary" href="/training/login">
                Sign in
              </Link>
            </div>
          </div>

          <div className="home-card">
            <div className="home-card-row">
              <span>Who</span>
              <strong>Any roboclub member</strong>
            </div>
            <div className="home-card-row">
              <span>Access</span>
              <strong>Email + code</strong>
            </div>
            <div className="home-card-row">
              <span>Eligibility</span>
              <strong>Listed by your team lead</strong>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
