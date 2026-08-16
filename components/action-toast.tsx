'use client';

import { useEffect, useState } from 'react';

export type ActionFlash = {
  status: 'success' | 'error';
  message: string;
  ts: number;
};

const FRESH_MS = 8000;
const SHOW_MS = 3600;

// Global toast for server-action results. Actions set a short-lived flash
// cookie instead of redirecting with ?status=...&message=... in the URL; the
// dashboard layout reads the cookie on the post-action re-render and passes it
// here. This component shows it once, deletes the cookie, and auto-dismisses —
// no navigation, no URL junk, no history entries.
export function ActionToast({ flash }: { flash: ActionFlash | null }) {
  const [current, setCurrent] = useState<ActionFlash | null>(null);

  useEffect(() => {
    if (!flash) return;
    // Consume the cookie so the toast never replays on a later render.
    document.cookie = 'hq_flash=; max-age=0; path=/';
    if (Date.now() - flash.ts > FRESH_MS) return;

    const raf = requestAnimationFrame(() => setCurrent(flash));
    const timer = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [flash]);

  if (!current) {
    return null;
  }

  return (
    <div
      className={`hq-action-toast hq-action-toast-${current.status}`}
      role="status"
      aria-live="polite"
    >
      <strong>{current.status === 'success' ? 'Saved' : 'Could not save'}</strong>
      <span>{current.message}</span>
      <button
        type="button"
        onClick={() => setCurrent(null)}
        aria-label="Dismiss"
        className="hq-action-toast-close"
      >
        ×
      </button>
    </div>
  );
}
