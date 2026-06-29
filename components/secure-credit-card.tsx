'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The interactive secure card view. SECURITY MODEL (defense in depth):
//   - The page never sends the real card digits to this component — it only
//     passes counts (how many 4-digit number groups, how many CVV digits). The
//     actual digits are fetched ON DEMAND, one window at a time, from
//     /api/credit-card/reveal, which re-checks the full view gate every call and
//     returns at most ONE 4-digit number group OR ONE CVV digit OR the expiry.
//   - Progressive reveal: only ONE thing is ever visible at a time, and every
//     reveal auto-hides after ~4 seconds. So a single screenshot can capture at
//     most 4 number digits, or 1 CVV digit, or the expiry — never the whole card.
//   - A live moving watermark (viewer name + email + live clock) stamps any
//     capture and makes it obviously live.
//   - Tab-away / window-blur heavily blurs the card and clears any reveal.
//   - PrintScreen / copy while revealed fires a best-effort screenshot signal to
//     the server and shows a full-screen red warning. NOTE: browser-based
//     screenshot detection is best-effort only — OS capture tools can bypass the
//     page entirely; this is a deterrent + audit trail, not a guarantee.

type RevealKind = 'number' | 'cvv' | 'expiry';

// What's currently revealed (at most one). For number/cvv we also track which
// index, so the displayed window matches what we fetched.
type Revealed =
  | { kind: 'number'; index: number; value: string }
  | { kind: 'cvv'; index: number; value: string }
  | { kind: 'expiry'; value: string }
  | null;

const AUTO_HIDE_MS = 4000;

export function SecureCreditCard({
  cardholder,
  numberGroups,
  cvvLength,
  viewerName,
  viewerEmail,
  firstView
}: {
  cardholder: string;
  numberGroups: number;
  cvvLength: number;
  viewerName: string;
  viewerEmail: string;
  firstView: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [revealed, setRevealed] = useState<Revealed>(null);
  const [obscured, setObscured] = useState(false);
  const [screenshotWarning, setScreenshotWarning] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(firstView);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `revealed` for use inside long-lived event listeners without
  // re-binding them (avoids stale closures and keeps those effects
  // dependency-free). Synced in an effect — never written during render.
  const revealedRef = useRef<Revealed>(null);
  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hideReveal = useCallback(() => {
    clearHideTimer();
    setRevealed(null);
  }, [clearHideTimer]);

  // Live ticking clock — seeded and ticked from timer callbacks (never in the
  // effect body) so the watermark/clock stays live without cascading renders.
  useEffect(() => {
    const seed = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(seed);
      clearInterval(id);
    };
  }, []);

  // Best-effort screenshot signal to the server + on-screen red warning.
  const fireScreenshotSignal = useCallback(() => {
    setScreenshotWarning(true);
    hideReveal();
    void fetch('/api/credit-card/screenshot-signal', { method: 'POST' }).catch(() => {
      // Best-effort: a failed report still shows the local warning.
    });
  }, [hideReveal]);

  // Focus / visibility deterrent: when the tab is hidden or the window loses
  // focus, blur the card and clear any reveal. If something was revealed at the
  // moment of a visibility-hide, treat it as a likely capture and signal.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (revealedRef.current) {
          fireScreenshotSignal();
        }
        setObscured(true);
        hideReveal();
      } else {
        setObscured(false);
      }
    };
    const onBlur = () => {
      setObscured(true);
      hideReveal();
    };
    const onFocus = () => setObscured(false);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [fireScreenshotSignal, hideReveal]);

  // PrintScreen + copy deterrent. PrintScreen often only surfaces on keyup; we
  // listen on both. Ctrl/Cmd+C only counts while a value is revealed.
  useEffect(() => {
    const onPrintScreen = (event: KeyboardEvent) => {
      if (event.key === 'PrintScreen') {
        fireScreenshotSignal();
      }
    };
    const onCopy = (event: KeyboardEvent) => {
      const isCopy = (event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C');
      if (isCopy && revealedRef.current) {
        fireScreenshotSignal();
      }
    };
    const handler = (event: KeyboardEvent) => {
      onPrintScreen(event);
      onCopy(event);
    };
    window.addEventListener('keyup', handler);
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keyup', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [fireScreenshotSignal]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const scheduleAutoHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setRevealed(null);
      hideTimerRef.current = null;
    }, AUTO_HIDE_MS);
  }, [clearHideTimer]);

  // Fetch and reveal exactly one window. Clears any previous reveal first, so at
  // most one thing is ever visible; schedules the ~4s auto-hide.
  const reveal = useCallback(
    async (kind: RevealKind, index: number) => {
      const key = `${kind}:${index}`;
      clearHideTimer();
      setRevealed(null);
      setLoadingKey(key);
      try {
        const response = await fetch('/api/credit-card/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: kind, index })
        });
        if (!response.ok) {
          setLoadingKey(null);
          return;
        }
        const data = (await response.json()) as { value?: string };
        const value = typeof data.value === 'string' ? data.value : '';
        setLoadingKey(null);
        if (kind === 'expiry') {
          setRevealed({ kind: 'expiry', value });
        } else if (kind === 'cvv') {
          setRevealed({ kind: 'cvv', index, value });
        } else {
          setRevealed({ kind: 'number', index, value });
        }
        scheduleAutoHide();
      } catch {
        setLoadingKey(null);
      }
    },
    [clearHideTimer, scheduleAutoHide]
  );

  const dismissReminder = useCallback(() => {
    setReminderOpen(false);
    void fetch('/api/credit-card/first-viewed', { method: 'POST' }).catch(() => {
      // Best-effort: worst case the reminder shows once more next time.
    });
  }, []);

  // Step the CVV: each tap shows the NEXT single digit (cycling), so only one
  // digit is ever on screen at a time.
  const stepCvv = useCallback(() => {
    if (cvvLength <= 0) return;
    const current = revealed?.kind === 'cvv' ? revealed.index : -1;
    const next = (current + 1) % cvvLength;
    void reveal('cvv', next);
  }, [cvvLength, revealed, reveal]);

  const clock = now
    ? now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    : '—';

  const watermarkText = `${viewerName} · ${viewerEmail} · ${clock}`;
  // Enough repeats to tile the whole card area for the diagonal watermark.
  const watermarkRow = Array.from({ length: 8 }, () => watermarkText).join('     ');

  const numberRevealed = revealed?.kind === 'number' ? revealed : null;
  const cvvRevealed = revealed?.kind === 'cvv' ? revealed : null;
  const expiryRevealed = revealed?.kind === 'expiry' ? revealed : null;

  const blockContextMenu = (event: React.MouseEvent) => event.preventDefault();

  return (
    <div className="secure-card-wrap" style={{ userSelect: 'none' }} onContextMenu={blockContextMenu}>
      <style>{`
        @keyframes secure-card-sheen {
          0% { transform: translateX(-120%) rotate(12deg); opacity: 0; }
          30% { opacity: 0.5; }
          60% { transform: translateX(160%) rotate(12deg); opacity: 0; }
          100% { transform: translateX(160%) rotate(12deg); opacity: 0; }
        }
        @keyframes secure-card-wm {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-180px, -120px); }
        }
        @keyframes secure-card-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.82); }
        }
      `}</style>

      <div
        aria-label="Shared club credit card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          aspectRatio: '1.586 / 1',
          borderRadius: 18,
          padding: '1.25rem 1.4rem',
          boxSizing: 'border-box',
          color: '#f4f7fb',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, #16233b 0%, #1f3a5f 38%, #25425f 60%, #11151c 100%)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          filter: obscured ? 'blur(16px)' : 'none',
          transition: 'filter 120ms ease',
          WebkitUserSelect: 'none',
          userSelect: 'none'
        }}
      >
        {/* Subtle moving sheen */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '45%',
            height: '100%',
            background:
              'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)',
            filter: 'blur(8px)',
            animation: 'secure-card-sheen 6s linear infinite',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {/* Live moving watermark overlay */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -60,
            left: -60,
            right: -60,
            bottom: -60,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 4,
            opacity: 0.16,
            transform: 'rotate(-24deg)'
          }}
        >
          <div style={{ animation: 'secure-card-wm 9s linear infinite' }}>
            {Array.from({ length: 10 }).map((_, row) => (
              <div
                key={row}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '0.62rem',
                  letterSpacing: '0.04em',
                  lineHeight: '1.9rem',
                  color: '#ffffff',
                  fontFamily: 'monospace'
                }}
              >
                {watermarkRow}
              </div>
            ))}
          </div>
        </div>

        {/* Card content */}
        <div style={{ position: 'relative', zIndex: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Top row: chip + org */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {/* EMV / RFID chip */}
            <div
              aria-hidden="true"
              style={{
                width: 46,
                height: 34,
                borderRadius: 7,
                background: 'linear-gradient(135deg, #e9c46a 0%, #d4a93f 50%, #b8860b 100%)',
                position: 'relative',
                boxShadow: 'inset 0 0 4px rgba(0,0,0,0.35)'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 5,
                  borderRadius: 3,
                  border: '1px solid rgba(80,60,10,0.55)',
                  background:
                    'repeating-linear-gradient(0deg, transparent 0 6px, rgba(80,60,10,0.5) 6px 7px), repeating-linear-gradient(90deg, transparent 0 8px, rgba(80,60,10,0.5) 8px 9px)'
                }}
              />
            </div>
            <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
              <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', fontWeight: 700, color: '#cfe0f2' }}>
                STANFORD STUDENT
              </div>
              <div style={{ fontSize: '0.62rem', letterSpacing: '0.1em', fontWeight: 700, color: '#cfe0f2' }}>
                ENTERPRISES
              </div>
            </div>
          </div>

          {/* Card number: four tappable groups, masked by default */}
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              gap: '0.55rem',
              flexWrap: 'wrap',
              fontFamily: 'monospace',
              fontSize: 'clamp(1.05rem, 4.4vw, 1.5rem)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.06em'
            }}
          >
            {Array.from({ length: numberGroups }).map((_, group) => {
              const isThis = numberRevealed?.index === group;
              const key = `number:${group}`;
              return (
                <button
                  key={group}
                  type="button"
                  onClick={() => void reveal('number', group)}
                  title="Tap to reveal these 4 digits"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    font: 'inherit',
                    letterSpacing: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    textShadow: '0 1px 8px rgba(0,0,0,0.4)'
                  }}
                >
                  {loadingKey === key ? '····' : isThis ? numberRevealed?.value : '••••'}
                </button>
              );
            })}
          </div>

          {/* Bottom row: VISA + cardholder + expiry/cvv controls */}
          <div
            style={{
              marginTop: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: '0.75rem'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.58rem',
                  letterSpacing: '0.14em',
                  color: '#aebfd4',
                  marginBottom: '0.15rem'
                }}
              >
                CARD HOLDER
              </div>
              <div
                style={{
                  fontSize: 'clamp(0.8rem, 3vw, 1rem)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {cardholder}
              </div>
              {/* Stylized VISA wordmark */}
              <div
                aria-hidden="true"
                style={{
                  marginTop: '0.4rem',
                  fontSize: '1.25rem',
                  fontStyle: 'italic',
                  fontWeight: 800,
                  letterSpacing: '0.04em',
                  color: '#f4f7fb',
                  textShadow: '0 1px 6px rgba(0,0,0,0.45)'
                }}
              >
                VISA
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexShrink: 0 }}>
              {/* Expiry */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#aebfd4' }}>EXP</div>
                <button
                  type="button"
                  onClick={() => void reveal('expiry', 0)}
                  title="Tap to reveal the expiry"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  {loadingKey === 'expiry:0' ? '··/··' : expiryRevealed ? expiryRevealed.value : '••/••'}
                </button>
              </div>
              {/* CVV — steps one digit at a time */}
              {cvvLength > 0 ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: '#aebfd4' }}>CVV</div>
                  <button
                    type="button"
                    onClick={() => stepCvv()}
                    title="Tap to step through the CVV one digit at a time"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      padding: 0,
                      letterSpacing: '0.3em'
                    }}
                  >
                    {cvvRevealed
                      ? `${cvvRevealed.value} (${cvvRevealed.index + 1}/${cvvLength})`
                      : '•'.repeat(cvvLength)}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Live tell + instructions */}
      <div style={{ maxWidth: 420, marginTop: '0.9rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#ff4d4d',
              boxShadow: '0 0 8px #ff4d4d',
              animation: 'secure-card-pulse 1.1s ease-in-out infinite'
            }}
          />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', color: '#8c1515' }}>
            LIVE · {clock}
          </span>
        </div>
        <p className="helper" style={{ margin: 0 }}>
          Tap a group of digits, the expiry, or the CVV to reveal it. For security only one piece is shown
          at a time and it hides itself after a few seconds. Screenshotting or copying is detected, logged,
          and reported.
        </p>
      </div>

      {/* Full-screen screenshot warning overlay */}
      {screenshotWarning ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Screenshot detected"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(140,21,21,0.97)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '2rem'
          }}
        >
          <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '0.06em', marginBottom: '1rem' }}>
            SCREENSHOT DETECTED
          </div>
          <p style={{ maxWidth: 460, fontSize: '1rem', lineHeight: 1.5 }}>
            This screenshot has been logged and automatically reported to the Financial Officer.
            Screenshotting or copying the credit card information will result in a permanent ban from
            credit card usage.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => setScreenshotWarning(false)}
            style={{ marginTop: '1.5rem' }}
          >
            I understand
          </button>
        </div>
      ) : null}

      {/* One-time first-view reminder */}
      {reminderOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Before you use the card"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
            background: 'rgba(11,4,4,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div
            style={{
              background: '#fff',
              color: '#171414',
              borderRadius: 14,
              maxWidth: 480,
              width: '100%',
              padding: '1.6rem 1.5rem',
              boxShadow: '0 24px 70px rgba(0,0,0,0.5)'
            }}
          >
            <h3 style={{ marginTop: 0 }}>Before you use the card</h3>
            <p style={{ lineHeight: 1.55 }}>
              Credit card expenses must be logged to this portal or via the Slack bot in a timely
              manner. Screenshotting or copying the credit card information will result in a permanent
              ban from credit card usage.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="button" onClick={dismissReminder}>
                I understand
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
