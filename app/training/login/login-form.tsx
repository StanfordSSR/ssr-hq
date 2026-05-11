'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function TrainingLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/training/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error || 'Could not send code. Please try again.');
        setLoading(false);
        return;
      }

      router.push(`/training/verify?email=${encodeURIComponent(email)}`);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <form className="form-stack" onSubmit={handleSubmit}>
      <div className="field">
        <label className="label" htmlFor="email">
          Your roster email
        </label>
        <input
          className="input"
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@stanford.edu"
          autoComplete="email"
          required
        />
      </div>

      <button className="button" type="submit" disabled={loading}>
        {loading ? 'Sending code...' : 'Send code'}
      </button>

      {error ? (
        <p className="helper" style={{ color: '#8c1515' }}>
          {error}
        </p>
      ) : (
        <p className="helper">
          If your email is on a team roster, a 6-digit code will arrive shortly.
        </p>
      )}
    </form>
  );
}
