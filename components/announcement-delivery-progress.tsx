'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { processNextAnnouncementDeliveryAction } from '@/app/dashboard/actions';

type AnnouncementDeliveryProgressProps = {
  announcementId: string;
  initialTotal: number;
  initialSent: number;
  initialFailed: number;
};

export function AnnouncementDeliveryProgress({
  announcementId,
  initialTotal,
  initialSent,
  initialFailed
}: AnnouncementDeliveryProgressProps) {
  const [stats, setStats] = useState({
    total: initialTotal,
    sent: initialSent,
    failed: initialFailed,
    remaining: Math.max(0, initialTotal - initialSent - initialFailed),
    done: initialTotal === 0 || initialSent + initialFailed >= initialTotal
  });
  const [isPending, startTransition] = useTransition();

  const percent = useMemo(() => {
    if (stats.total === 0) return 100;
    return Math.round(((stats.sent + stats.failed) / stats.total) * 100);
  }, [stats.failed, stats.sent, stats.total]);

  useEffect(() => {
    if (stats.done || isPending || stats.remaining <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(async () => {
        const result = await processNextAnnouncementDeliveryAction(announcementId);
        if (result.ok && result.data) {
          setStats(result.data);
        }
      });
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [announcementId, isPending, stats.done, stats.remaining]);

  if (stats.total === 0) {
    return <p className="hq-inline-note">No recipient leads matched this announcement.</p>;
  }

  return (
    <div className="hq-announcement-progress">
      <div className="hq-announcement-progress-copy">
        <span>
          {stats.sent} of {stats.total} sent
        </span>
        {stats.failed > 0 ? <span>{stats.failed} failed</span> : null}
      </div>
      <div className="hq-announcement-progress-track" aria-hidden="true">
        <div className="hq-announcement-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
