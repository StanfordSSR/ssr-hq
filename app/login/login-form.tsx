'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();

    // Important: point to the site root, not /auth/callback
    // The email template will append /auth/confirm with token_hash.
    const redirectTo = window.location.origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo
      }
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage('Magic link sent. Check your inbox and spam folder.');
    setLoading(false);
  };

  return (
    <form className="form-stack" onSubmit={handleLogin}>
      <div className="field">
        <label className="label" htmlFor="email">
          Stanford email or approved team lead email
        </label>
        <input
          className="input"
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@stanford.edu"
          required
        />
      </div>

      <button className="button" type="submit" disabled={loading}>
        {loading ? 'Sending link...' : 'Send magic link'}
      </button>

      {message ? <p className="helper">{message}</p> : null}
      {error ? <p className="helper" style={{ color: '#8c1515' }}>{error}</p> : null}
    </form>
  );
}