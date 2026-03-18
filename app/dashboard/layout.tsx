import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';
import { signOutAction } from '@/app/dashboard/teams/actions';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/teams', label: 'Manage Teams' },
  { href: '/dashboard/members', label: 'Manage Members' },
  { href: '/dashboard/finances', label: 'Manage Finances' },
  { href: '/dashboard/tasks', label: 'Assign Tasks' },
  { href: '/dashboard/settings', label: 'Club Settings' }
];

const leadNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/members', label: 'Manage Members' },
  { href: '/dashboard/purchases', label: 'Log Purchase' },
  { href: '/dashboard/tasks', label: 'Tasks' }
];

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', user.id)
    .single();

  if (!profile?.active) {
    redirect('/login');
  }

  const nav = profile.role === 'admin' ? adminNav : leadNav;

  const initials =
    profile?.full_name
      ?.split(' ')
      .map((part: string) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U';

  return (
    <div className="hq-shell">
      <header className="hq-topbar">
        <div className="hq-topbar-inner">
          <div className="hq-topbar-left">
            <Link href="/dashboard" className="hq-brand">
              Stanford Student Robotics HQ
            </Link>

            <nav className="hq-nav" aria-label="HQ navigation">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="hq-nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="hq-user">
            <details className="hq-user-menu">
              <summary className="hq-user-summary">
                <span className="hq-avatar">{initials}</span>
                <span className="hq-user-name">{profile.full_name || user.email}</span>
                <span className="hq-user-caret" aria-hidden="true">
                  ▾
                </span>
              </summary>

              <div className="hq-user-dropdown">
                <Link href="/dashboard/profile" className="hq-user-dropdown-link">
                  Personal settings
                </Link>

                <form action={signOutAction}>
                  <button className="hq-user-dropdown-button" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main className="hq-main">{children}</main>
    </div>
  );
}
