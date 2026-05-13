import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingLogoutButton } from '@/app/training/home/logout-button';
import { TrainingOptInButton } from '@/app/training/home/opt-in-button';
import { getTrainingSession } from '@/lib/training-auth';
import { listModules } from '@/lib/training-content';
import {
  getCompletionsForEmail,
  getMemberDisplayName,
  getOptInsForEmail,
  getRequiredOutstanding
} from '@/lib/training-modules';

export default async function TrainingMemberHomePage() {
  const session = await getTrainingSession();

  if (!session) {
    redirect('/training/login');
  }

  const outstanding = await getRequiredOutstanding(session.email);
  if (outstanding) {
    redirect(`/training/modules/${outstanding.slug}`);
  }

  const [completions, optIns, displayName] = await Promise.all([
    getCompletionsForEmail(session.email),
    getOptInsForEmail(session.email),
    getMemberDisplayName(session.email)
  ]);

  const completedSlugs = new Set(completions.map((c) => c.moduleSlug));
  const optInSlugs = new Set(optIns);
  const modules = listModules();
  const greetingName = displayName?.split(' ')[0] || session.email;

  const required = modules.filter((m) => m.required || (m.gatedByOptIn && optInSlugs.has(m.slug)));
  const available = modules.filter((m) => m.gatedByOptIn && !optInSlugs.has(m.slug) && !completedSlugs.has(m.slug));
  const completed = modules.filter((m) => completedSlugs.has(m.slug));

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="training-home">
          <div className="training-home-head">
            <p className="auth-kicker">SSR Training</p>
            <h1 className="auth-title">Welcome, {greetingName}.</h1>
            <p className="auth-subtitle">
              Trainings published for Stanford Student Robotics members. Required modules are marked below; opt-in
              trainings unlock access to specific resources.
            </p>
            <div className="training-home-actions">
              <TrainingLogoutButton />
            </div>
          </div>

          {required.length > 0 ? (
            <div className="training-home-section">
              <h2 className="training-home-section-title">Required</h2>
              <ul className="training-module-list">
                {required.map((mod) => {
                  const isComplete = completedSlugs.has(mod.slug);
                  return (
                    <li
                      key={mod.slug}
                      className={`training-module-card ${isComplete ? 'is-complete' : ''}`}
                    >
                      <div className="training-module-card-head">
                        <div className="training-module-tags">
                          <span className="training-tag training-tag-required">Required</span>
                          {isComplete ? (
                            <span className="training-tag training-tag-complete">Completed</span>
                          ) : (
                            <span className="training-tag training-tag-todo">Not started</span>
                          )}
                        </div>
                        <span className="training-module-time">~{mod.estimatedMinutes} min</span>
                      </div>
                      <h3 className="training-module-title">{mod.title}</h3>
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
            </div>
          ) : null}

          {available.length > 0 ? (
            <div className="training-home-section">
              <h2 className="training-home-section-title">Available trainings</h2>
              <p className="training-home-section-sub">
                Optional trainings that unlock specific privileges. Once you opt in, the training is required before
                the privilege is granted.
              </p>
              <ul className="training-module-list">
                {available.map((mod) => (
                  <li key={mod.slug} className="training-module-card">
                    <div className="training-module-card-head">
                      <div className="training-module-tags">
                        <span className="training-tag training-tag-optin">Available</span>
                      </div>
                      <span className="training-module-time">~{mod.estimatedMinutes} min</span>
                    </div>
                    <h3 className="training-module-title">{mod.title}</h3>
                    <p className="training-module-subtitle">{mod.subtitle}</p>
                    <div className="training-module-actions">
                      <TrainingOptInButton slug={mod.slug} label="Request access" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {completed.length > 0 ? (
            <div className="training-home-section">
              <h2 className="training-home-section-title">Completed</h2>
              <ul className="training-module-list">
                {completed.map((mod) => (
                  <li key={mod.slug} className="training-module-card is-complete">
                    <div className="training-module-card-head">
                      <div className="training-module-tags">
                        <span className="training-tag training-tag-complete">Completed</span>
                      </div>
                      <span className="training-module-time">~{mod.estimatedMinutes} min</span>
                    </div>
                    <h3 className="training-module-title">{mod.title}</h3>
                    <p className="training-module-subtitle">{mod.subtitle}</p>
                    <div className="training-module-actions">
                      <Link className="button-ghost" href={`/training/modules/${mod.slug}`}>
                        Review module
                      </Link>
                      <Link className="text-link" href={`/training/modules/${mod.slug}/certificate`}>
                        View certificate →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
