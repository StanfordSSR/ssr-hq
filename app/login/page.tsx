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
      <Header />
      <main className="page-shell">
        <section className="auth-shell">
          <div className="auth-copy">
            <p className="auth-kicker">Secure login</p>
            <h1 className="auth-title">Log in to HQ</h1>
            <p className="auth-subtitle">
              Use your approved email to receive a secure sign-in link.
            </p>
            <Link className="text-link" href="/">
              Back to home
            </Link>
          </div>

          <div className="auth-card">
            <LoginForm />
          </div>
        </section>
      </main>
    </>
  );
}