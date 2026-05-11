'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TrainingLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    await fetch('/api/training/logout', { method: 'POST' });
    router.push('/training');
    router.refresh();
  };

  return (
    <button className="button-ghost" type="button" onClick={handleLogout} disabled={loading}>
      {loading ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
