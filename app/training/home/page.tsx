import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { TrainingLogoutButton } from '@/app/training/home/logout-button';
import { TrainingOptInButton } from '@/app/training/home/opt-in-button';
import { getTrainingSession } from '@/lib/training-auth';
import { listModules, type TrainingModule } from '@/lib/training-content';
import {
  getCompletionsForEmail,
  getMemberDisplayName,
  getOptInsForEmail
} from '@/lib/training-modules';

type Status = 'required' | 'completed' | 'available';

function ModuleHero({ slug }: { slug: string }) {
  // Stylized cover art per module — pure SVG so nothing extra ships
  if (slug === 'initiation') {
    return (
      <svg className="course-hero-art" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="hero-init-bg" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#a01717" />
            <stop offset="60%" stopColor="#6f1010" />
            <stop offset="100%" stopColor="#3a0808" />
          </linearGradient>
          <radialGradient id="hero-init-glow" cx="65%" cy="35%" r="60%">
            <stop offset="0%" stopColor="rgba(255,200,120,0.6)" />
            <stop offset="100%" stopColor="rgba(255,200,120,0)" />
          </radialGradient>
        </defs>
        <rect width="400" height="280" fill="url(#hero-init-bg)" />
        <rect width="400" height="280" fill="url(#hero-init-glow)" />
        {/* Constitution book stack */}
        <g transform="translate(112 96)">
          <rect x="0" y="0" width="180" height="120" rx="6" fill="#fbeec2" stroke="#5a3a08" strokeWidth="2" />
          <rect x="0" y="0" width="180" height="14" fill="#8c1515" />
          <rect x="-8" y="-12" width="196" height="14" rx="3" fill="#3a0808" />
          <rect x="14" y="32" width="152" height="3" fill="#bda077" />
          <rect x="14" y="44" width="120" height="3" fill="#bda077" />
          <rect x="14" y="56" width="142" height="3" fill="#bda077" />
          <rect x="14" y="74" width="100" height="3" fill="#bda077" />
          <rect x="14" y="86" width="130" height="3" fill="#bda077" />
          <text x="90" y="20" textAnchor="middle" fontSize="11" fill="#fff8e0" fontWeight="700" letterSpacing="0.18em">
            SSR
          </text>
        </g>
        {/* Stars */}
        <g fill="#ffd86c" opacity="0.9">
          <polygon points="60,52 64,62 75,62 66,68 70,80 60,73 50,80 54,68 45,62 56,62" />
          <polygon points="332,196 336,206 347,206 338,212 342,224 332,217 322,224 326,212 317,206 328,206" />
          <polygon points="350,52 353,60 362,60 355,65 358,74 350,69 342,74 345,65 338,60 347,60" />
        </g>
      </svg>
    );
  }
  // Default: room-access workshop hero
  return (
    <svg className="course-hero-art" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="hero-room-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#1a4670" />
          <stop offset="60%" stopColor="#0e3050" />
          <stop offset="100%" stopColor="#091e34" />
        </linearGradient>
        <radialGradient id="hero-room-glow" cx="80%" cy="20%" r="60%">
          <stop offset="0%" stopColor="rgba(120,200,255,0.55)" />
          <stop offset="100%" stopColor="rgba(120,200,255,0)" />
        </radialGradient>
      </defs>
      <rect width="400" height="280" fill="url(#hero-room-bg)" />
      <rect width="400" height="280" fill="url(#hero-room-glow)" />
      {/* Grid floor (perspective) */}
      <g stroke="rgba(255,255,255,0.12)" strokeWidth="0.9">
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`h-${i}`} x1={0} y1={200 + i * 10} x2={400} y2={200 + i * 10} />
        ))}
        {Array.from({ length: 12 }).map((_, i) => {
          const x = 200 + (i - 6) * 22;
          return <line key={`v-${i}`} x1={200} y1={200} x2={x} y2={280} />;
        })}
      </g>
      {/* 3D printer */}
      <g transform="translate(252 110)">
        <rect x="0" y="0" width="78" height="90" rx="4" fill="#262626" stroke="#0a0a0a" strokeWidth="1.4" />
        <rect x="6" y="6" width="66" height="56" rx="2" fill="#0a1018" stroke="#0a0a0a" />
        <rect x="6" y="6" width="66" height="6" fill="#1f8a4a" />
        <rect x="20" y="22" width="38" height="3" fill="#7aff9a" opacity="0.8" />
        <rect x="20" y="30" width="28" height="3" fill="#7aff9a" opacity="0.7" />
        <rect x="20" y="38" width="32" height="3" fill="#7aff9a" opacity="0.7" />
        <rect x="14" y="72" width="50" height="14" rx="2" fill="#1f8a4a" />
      </g>
      {/* Workbench */}
      <g transform="translate(60 156)">
        <rect x="0" y="0" width="160" height="14" fill="#a07a4e" />
        <rect x="0" y="14" width="160" height="6" fill="#5a3f1a" />
        <rect x="8" y="20" width="6" height="40" fill="#3a2515" />
        <rect x="146" y="20" width="6" height="40" fill="#3a2515" />
        {/* Tools on the bench */}
        <rect x="22" y="-12" width="36" height="6" fill="#c9342a" rx="3" />
        <rect x="56" y="-7" width="14" height="3" fill="#bdbdbd" />
        <circle cx="100" cy="-4" r="8" fill="#1f5fa6" />
        <rect x="126" y="-10" width="20" height="10" fill="#3a3a3a" />
      </g>
      {/* Hanging fluorescent light */}
      <g>
        <rect x="120" y="32" width="180" height="6" fill="#dadcdf" />
        <rect x="124" y="38" width="172" height="2" fill="#ffffff" opacity="0.9" />
        <rect x="200" y="14" width="2" height="18" fill="#3a3a3a" />
      </g>
    </svg>
  );
}

function StatusPill({ status }: { status: Status }) {
  const labels: Record<Status, string> = {
    required: 'Required',
    completed: 'Completed',
    available: 'Available'
  };
  return <span className={`course-pill course-pill-${status}`}>{labels[status]}</span>;
}

function ChapterStrip({ mod }: { mod: TrainingModule }) {
  return (
    <ul className="course-chapter-strip" aria-label="Chapters">
      {mod.chapters.map((c) => (
        <li key={c.slug} title={c.title}>
          <span className="course-chip" style={{ background: c.accent }} aria-hidden />
          <span className="course-chip-label">
            {c.simulation ? '🎮 ' : ''}
            {c.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ModuleCard({
  mod,
  status
}: {
  mod: TrainingModule;
  status: Status;
}) {
  return (
    <article className={`course-card course-card-${status}`}>
      <div className="course-card-hero">
        <ModuleHero slug={mod.slug} />
        <div className="course-card-hero-overlay">
          <StatusPill status={status} />
        </div>
      </div>
      <div className="course-card-body">
        <header className="course-card-head">
          <h3 className="course-card-title">{mod.title}</h3>
          <p className="course-card-subtitle">{mod.subtitle}</p>
        </header>
        <dl className="course-card-stats">
          <div>
            <dt>Chapters</dt>
            <dd>{mod.chapters.length}</dd>
          </div>
          <div>
            <dt>Est. time</dt>
            <dd>~{mod.estimatedMinutes} min</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>
              {mod.chapters.some((c) => c.simulation)
                ? 'Reading + 3D simulation'
                : 'Reading + quiz'}
            </dd>
          </div>
        </dl>
        <ChapterStrip mod={mod} />
        <footer className="course-card-foot">
          {status === 'completed' ? (
            <>
              <Link className="button-primary" href={`/training/modules/${mod.slug}`}>
                Review module
              </Link>
              <Link className="text-link" href={`/training/modules/${mod.slug}/certificate`}>
                View certificate →
              </Link>
            </>
          ) : status === 'available' ? (
            <TrainingOptInButton slug={mod.slug} label="Request access" />
          ) : (
            <Link className="button-primary" href={`/training/modules/${mod.slug}`}>
              Start module →
            </Link>
          )}
        </footer>
      </div>
    </article>
  );
}

export default async function TrainingMemberHomePage() {
  const session = await getTrainingSession();
  if (!session) redirect('/training/login');

  const [completions, optIns, displayName] = await Promise.all([
    getCompletionsForEmail(session.email),
    getOptInsForEmail(session.email),
    getMemberDisplayName(session.email)
  ]);

  const completedSlugs = new Set(completions.map((c) => c.moduleSlug));
  const optInSlugs = new Set(optIns);
  const modules = listModules();
  const greetingName = displayName?.split(' ')[0] || session.email;

  const required = modules.filter(
    (m) => !completedSlugs.has(m.slug) && (m.required || (m.gatedByOptIn && optInSlugs.has(m.slug)))
  );
  const available = modules.filter(
    (m) => m.gatedByOptIn && !optInSlugs.has(m.slug) && !completedSlugs.has(m.slug)
  );
  const completed = modules.filter((m) => completedSlugs.has(m.slug));

  const stats = {
    required: required.length,
    completed: completed.length,
    available: available.length,
    total: modules.length
  };

  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="course-home">
          <header className="course-header">
            <div>
              <p className="course-eyebrow">Stanford Student Robotics · Training</p>
              <h1 className="course-h1">Welcome back, {greetingName}.</h1>
              <p className="course-lede">
                Required orientation and opt-in safety training for SSR members. Each module combines
                short reading sections with interactive checks; the room-access training ends in a 3D
                workshop simulation.
              </p>
            </div>
            <div className="course-header-meta">
              <p className="course-header-email">{session.email}</p>
              <TrainingLogoutButton />
            </div>
          </header>

          <div className="course-stat-row">
            <div className="course-stat">
              <span className="course-stat-num">{stats.required}</span>
              <span className="course-stat-label">Open required</span>
            </div>
            <div className="course-stat">
              <span className="course-stat-num">{stats.completed}</span>
              <span className="course-stat-label">Completed</span>
            </div>
            <div className="course-stat">
              <span className="course-stat-num">{stats.available}</span>
              <span className="course-stat-label">Available</span>
            </div>
            <div className="course-stat">
              <span className="course-stat-num">{stats.total}</span>
              <span className="course-stat-label">Total modules</span>
            </div>
          </div>

          {required.length > 0 ? (
            <section className="course-section">
              <header className="course-section-head">
                <h2 className="course-section-title">Required for you</h2>
                <p className="course-section-sub">
                  Complete these to maintain your membership in good standing or to unlock the resources you&apos;ve
                  requested access to.
                </p>
              </header>
              <div className="course-card-grid">
                {required.map((mod) => (
                  <ModuleCard key={mod.slug} mod={mod} status="required" />
                ))}
              </div>
            </section>
          ) : null}

          {available.length > 0 ? (
            <section className="course-section">
              <header className="course-section-head">
                <h2 className="course-section-title">Available trainings</h2>
                <p className="course-section-sub">
                  Opt-in modules that unlock specific resources or privileges. Click <strong>Request access</strong> to
                  add the training to your required list.
                </p>
              </header>
              <div className="course-card-grid">
                {available.map((mod) => (
                  <ModuleCard key={mod.slug} mod={mod} status="available" />
                ))}
              </div>
            </section>
          ) : null}

          {completed.length > 0 ? (
            <section className="course-section">
              <header className="course-section-head">
                <h2 className="course-section-title">Completed</h2>
                <p className="course-section-sub">Review any module freely or download your certificate.</p>
              </header>
              <div className="course-card-grid">
                {completed.map((mod) => (
                  <ModuleCard key={mod.slug} mod={mod} status="completed" />
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </main>
    </>
  );
}
