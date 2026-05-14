'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export function LoginForm() {
  const [mode, setMode] = useState<'password' | 'magic_link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!window.location.hash) {
      return;
    }

    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorDescription = params.get('error_description');

    if (errorDescription) {
      setError(errorDescription.replace(/\+/g, ' '));
      window.history.replaceState({}, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      window.location.assign('/dashboard');
      return;
    }

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
      <div className="hq-tab-row">
        <button
          className={`hq-tab-button${mode === 'password' ? ' hq-tab-button-active' : ''}`}
          type="button"
          onClick={() => {
            setMode('password');
            setMessage(null);
            setError(null);
          }}
        >
          Password
        </button>
        <button
          className={`hq-tab-button${mode === 'magic_link' ? ' hq-tab-button-active' : ''}`}
          type="button"
          onClick={() => {
            setMode('magic_link');
            setMessage(null);
            setError(null);
          }}
        >
          Magic link
        </button>
      </div>

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

      {mode === 'password' ? (
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            className="input"
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />
        </div>
      ) : null}

      <button className="button" type="submit" disabled={loading}>
        {loading ? mode === 'password' ? 'Signing in...' : 'Sending link...' : mode === 'password' ? 'Sign in with password' : 'Send magic link'}
      </button>

      {mode === 'password' ? <p className="helper">Magic-link login still works if you prefer not to use a password.</p> : null}
      {message ? <p className="helper">{message}</p> : null}
      {error ? <p className="helper" style={{ color: '#8c1515' }}>{error}</p> : null}
    </form>
  );
}
