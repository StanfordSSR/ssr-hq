import Link from 'next/link';
import { Header } from '@/components/header';

export default function HomePage() {
  return (
    <>
      <Header
        action={
          <div className="button-row">
            <Link className="button-ghost" href="/login">
              Log in
            </Link>
            <a className="button-secondary" href="#ops-grid">
              View features
            </a>
          </div>
        }
      />

      <main className="page-shell">
        <section className="hero">
          <div className="hero-card">
            <span className="eyebrow">Mission control for Stanford SSR</span>
            <h2>Build robots. Not finance spaghetti.</h2>
            <p>
              This starter gives Stanford Student Robotics a polished front door, email login with Supabase,
              and an admin basecamp for inviting or removing team leads. It is intentionally lean so you can
              stack funding workflows, receipt uploads, member logging, and quarterly reporting on a sane foundation.
            </p>

            <div className="hero-grid" id="ops-grid">
              <div className="stat-tile">
                <strong>Auth</strong>
                <span>Magic-link login plus role-based access.</span>
              </div>
              <div className="stat-tile">
                <strong>Admins</strong>
                <span>Invite and deactivate team leads in one dashboard.</span>
              </div>
              <div className="stat-tile">
                <strong>Ready</strong>
                <span>Built for hq.stanfordssr.org from the jump.</span>
              </div>
              <div className="stat-tile">
                <strong>MVP</strong>
                <span>Clean base for receipts, budgets, reports, and more.</span>
              </div>
            </div>
          </div>

          <aside className="panel">
            <div className="kicker">Starter stack</div>
            <h3>Next.js + Supabase + Vercel</h3>
            <p>
              Postgres keeps your data relational and sane. Supabase Auth handles sign-in. Vercel ships the app.
              This combo is the sweet spot for a club portal that starts free without becoming cursed later.
            </p>

            <div className="form-stack" style={{ marginTop: 16 }}>
              <div className="stat-tile">
                <strong>Roles</strong>
                <span>admin, team_lead</span>
              </div>
              <div className="stat-tile">
                <strong>Today</strong>
                <span>Invite leads and manage access</span>
              </div>
              <div className="stat-tile">
                <strong>Next</strong>
                <span>Add budgets, receipts, reports, active-member logs</span>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
