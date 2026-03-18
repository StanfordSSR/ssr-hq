import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/header';
import { LoginForm } from '@/app/login/login-form';
import { createClient } from '@/lib/supabase-server';

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <>
      <Header
        action={
          <Link className="button-ghost" href="/">
            Back home
          </Link>
        }
      />
      <main className="page-shell">
        <section className="hero" style={{ alignItems: 'start' }}>
          <div className="hero-card">
            <span className="eyebrow">Secure access</span>
            <h2>Log into HQ.</h2>
            <p>
              Team leads and admins get in through Supabase Auth. Start with magic-link sign-in so you can move fast,
              then add SSO later if Stanford identity becomes worth the effort.
            </p>
          </div>

          <aside className="panel">
            <h3>Sign in</h3>
            <p>Enter your email and we will beam over a secure login link.</p>
            <LoginForm />
          </aside>
        </section>
      </main>
    </>
  );
}
