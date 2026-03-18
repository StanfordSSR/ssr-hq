import Link from 'next/link';

type HeaderProps = {
  action?: React.ReactNode;
};

export function Header({ action }: HeaderProps) {
  return (
    <header className="topbar">
      <div className="page-shell topbar-inner">
        <Link href="/" className="brand" aria-label="Stanford Student Robotics HQ home">
          <span className="brand-text">Stanford Student Robotics HQ</span>
        </Link>

        <nav className="topnav" aria-label="Main navigation">
          <Link href="/">Home</Link>
          <Link href="/login">Log in</Link>
          {action}
        </nav>
      </div>
    </header>
  );
}