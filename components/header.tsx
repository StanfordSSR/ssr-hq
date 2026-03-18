import Link from 'next/link';

export function Header({ action }: { action?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div className="page-shell topbar-inner">
        <Link href="/" className="wordmark">
          <div className="wordmark-badge">HQ</div>
          <div className="wordmark-copy">
            <h1>Stanford Student Robotics HQ</h1>
            <p>Teams, budgets, receipts, reports, and club ops in one place.</p>
          </div>
        </Link>
        {action}
      </div>
    </div>
  );
}
