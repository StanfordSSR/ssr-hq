'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TrainingVerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/training/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error || 'That code is not valid.');
        setLoading(false);
        return;
      }

      router.push('/training/home');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label className="label" htmlFor="code">
          6-digit code
        </label>
        <input
          className="input"
          id="code"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          placeholder="123456"
          autoComplete="one-time-code"
          required
          style={{ letterSpacing: '0.4em', fontSize: '20px', textAlign: 'center' }}
        />
      </div>

      <button className="button" type="submit" disabled={loading || code.length !== 6}>
        {loading ? 'Verifying...' : 'Verify and sign in'}
      </button>

      {error ? (
        <p className="helper" style={{ color: '#8c1515' }}>
          {error}
        </p>
      ) : null}
    </form>
  );
}
