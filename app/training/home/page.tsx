import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingLogoutButton } from '@/app/training/home/logout-button';
import { getTrainingSession } from '@/lib/training-auth';
import { listModules } from '@/lib/training-content';
import { getCompletionsForEmail, getMemberDisplayName, getRequiredOutstanding } from '@/lib/training-modules';

export default async function TrainingMemberHomePage() {
  const session = await getTrainingSession();

  if (!session) {
    redirect('/training/login');
  }

  const outstanding = await getRequiredOutstanding(session.email);
  if (outstanding) {
    redirect(`/training/modules/${outstanding.slug}`);
  }

  const [completions, displayName] = await Promise.all([
    getCompletionsForEmail(session.email),
    getMemberDisplayName(session.email)
  ]);

  const completedSlugs = new Set(completions.map((c) => c.moduleSlug));
  const modules = listModules();
  const greetingName = displayName?.split(' ')[0] || session.email;

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="training-home">
          <div className="training-home-head">
            <p className="auth-kicker">SSR Training</p>
            <h1 className="auth-title">Welcome, {greetingName}.</h1>
            <p className="auth-subtitle">
              Trainings published for Stanford Student Robotics members. Required modules are marked below.
            </p>
            <div className="training-home-actions">
              <TrainingLogoutButton />
            </div>
          </div>

          <ul className="training-module-list">
            {modules.map((mod) => {
              const isComplete = completedSlugs.has(mod.slug);
              return (
                <li key={mod.slug} className={`training-module-card ${isComplete ? 'is-complete' : ''}`}>
                  <div className="training-module-card-head">
                    <div className="training-module-tags">
                      {mod.required ? <span className="training-tag training-tag-required">Required</span> : null}
                      {isComplete ? (
                        <span className="training-tag training-tag-complete">Completed</span>
                      ) : (
                        <span className="training-tag training-tag-todo">Not started</span>
                      )}
                    </div>
                    <span className="training-module-time">~{mod.estimatedMinutes} min</span>
                  </div>
                  <h2 className="training-module-title">{mod.title}</h2>
                  <p className="training-module-subtitle">{mod.subtitle}</p>
                  <div className="training-module-actions">
                    {isComplete ? (
                      <>
                        <Link className="button-ghost" href={`/training/modules/${mod.slug}`}>
                          Review module
                        </Link>
                        <Link className="text-link" href={`/training/modules/${mod.slug}/certificate`}>
                          View certificate →
                        </Link>
                      </>
                    ) : (
                      <Link className="button" href={`/training/modules/${mod.slug}`}>
                        Start training →
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}
