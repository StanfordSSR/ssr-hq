'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TrainingOptInButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/training/modules/${slug}/opt-in`, { method: 'POST' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error || 'Could not request access. Please try again.');
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className="button" onClick={handleClick} disabled={loading}>
        {loading ? 'Requesting...' : label}
      </button>
      {error ? (
        <p className="helper" style={{ color: '#8c1515' }}>
          {error}
        </p>
      ) : null}
    </>
  );
}
