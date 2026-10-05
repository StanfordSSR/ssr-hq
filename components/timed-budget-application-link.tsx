'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TEAM_BUDGET_OPENS_AT } from '@/lib/team-budget-application-rules';

export function TimedBudgetApplicationLink({
  href,
  className,
  label,
  initialOpen,
  canPreview = false
}: {
  href: string;
  className: string;
  label: string;
  initialOpen: boolean;
  canPreview?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  useEffect(() => {
    if (isOpen) return;
    const timer = window.setTimeout(() => setIsOpen(true), Math.max(0, Date.parse(TEAM_BUDGET_OPENS_AT) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  if (!isOpen && !canPreview) return <span className="hq-inline-note">Budget application opens at 7:20 PM Pacific</span>;
  return <Link href={href} className={className}>{!isOpen && canPreview ? 'Preview budget application' : label}</Link>;
}
