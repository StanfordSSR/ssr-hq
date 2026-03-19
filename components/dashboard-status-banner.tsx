'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function DashboardStatusBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const status = searchParams.get('status');
  const message = searchParams.get('message');

  const banner = useMemo(() => {
    if ((status !== 'success' && status !== 'error') || !message) {
      return null;
    }

    return {
      status,
      message
    };
  }, [message, status]);

  if (!banner) {
    return null;
  }

  const dismiss = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('status');
    params.delete('message');
    const next = params.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      dismiss();
    }, 3600);

    return () => window.clearTimeout(timeout);
  }, [pathname, router, searchParams, status, message]);

  return (
    <section className={`hq-status-banner hq-status-banner-${banner.status}`} role="status" aria-live="polite">
      <div className="hq-status-banner-copy">
        <strong>{banner.status === 'success' ? 'Saved' : 'Could not save'}</strong>
        <span>{banner.message}</span>
      </div>

      <button className="hq-status-banner-close" type="button" onClick={dismiss} aria-label="Dismiss status message">
        ×
      </button>
    </section>
  );
}
