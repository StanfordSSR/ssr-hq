import Link from 'next/link';
import { Header } from '@/components/header';
import { HomeTypewriter } from '@/components/home-typewriter';

export default function HomePage() {
  return (
    <>
      <Header />
      <main className="page-shell">
        <section className="home-shell">
          <div className="home-copy">
            <p className="home-kicker">Internal portal</p>
            <h1 className="home-title">Stanford Student Robotics HQ</h1>
            <HomeTypewriter />

            <div className="button-row">
              <Link className="button-primary" href="/login">
                Log in
              </Link>
            </div>
          </div>

          <div className="home-card">
            <div className="home-card-row">
              <span>Users</span>
              <strong>Admin-managed</strong>
            </div>
            <div className="home-card-row">
              <span>Access</span>
              <strong>Magic link login</strong>
            </div>
            <div className="home-card-row">
              <span>Portal use</span>
              <strong>Club operations</strong>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
