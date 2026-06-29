'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// The interactive secure card view. SECURITY MODEL (defense in depth):
//   - The page never sends the real card digits in its HTML — it only passes
//     counts (how many 4-digit number groups, how many CVV digits). On mount the
//     component fetches the card once from /api/credit-card/reveal (which enforces
//     the full view gate) and caches it in memory so reveals are instant. The
//     cache lives only in this component's ref and is never rendered except as the
//     single window the user is actively holding.
//   - PRESS-AND-HOLD reveal: a value is only visible while the pointer/finger is
//     physically held down on it, and hides the instant the press is released
//     (also on tab-away, scroll, or a safety timeout). Only ONE thing is ever
//     visible at a time. This is the key deterrent against an OS screenshot that
//     the browser cannot see (e.g. macOS Shift+Cmd+4): that shortcut needs a
//     click-and-drag with the same pointer that must stay held on the digit, so
//     it can't frame a selection while a digit is shown. A full-screen grab can
//     still catch ONE held window — but never the whole card, and never without
//     the identity watermark stamped across it.
//   - A bold live watermark (viewer name + email + live clock) is tiled across
//     the card ABOVE the digits, so any capture is legibly traceable to the
//     viewer and obviously live.
//   - Tab-away / window-blur heavily blurs the card and clears any reveal.
//   - PrintScreen / copy while revealed fires a best-effort signal to the server
//     and shows a full-screen warning. NOTE: browser-based screenshot detection
//     is best-effort only — native OS capture tools bypass the page entirely.
//     The press-and-hold + watermark above are what actually limit the damage;
//     detection is just an extra deterrent + audit trail, not a guarantee.

type RevealKind = 'number' | 'cvv' | 'expiry';

// What's currently revealed (at most one). For number/cvv we also track which
// index, so the displayed window matches what we fetched.
type Revealed =
  | { kind: 'number'; index: number; value: string }
  | { kind: 'cvv'; index: number; value: string }
  | { kind: 'expiry'; value: string }
  | null;

// Safety cap: even while held, a value force-hides after this long so a digit
// can't be pinned open indefinitely (e.g. by wedging the mouse button).
const MAX_HOLD_MS = 6000;

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
  // True only while a press is physically held down. Reveals are gated on this so
  // a value never appears after the user has already released, and so a release
  // during the (cold-start) load is honored.
  const holdingRef = useRef(false);
  // Card values fetched once on load and cached client-side so press-and-hold is
  // instant (no per-hold network round-trip). Kept in a ref, not state, so it is
  // never written into render output. `ready` just flips the placeholders live.
  const cacheRef = useRef<{ numberGroups: string[]; expiry: string; cvv: string } | null>(null);
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

  // Single canonical "hide": ends any active hold, stops a pending fetch from
  // rendering, and clears the displayed value. Used on release, tab-away, blur,
  // scroll, screenshot signal, and the safety timeout.
  const hideReveal = useCallback(() => {
    holdingRef.current = false;
    clearHideTimer();
    setLoadingKey(null);
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
    // Any scroll releases a held reveal — prevents holding a digit and scrolling
    // the page to reposition it for a capture.
    const onScroll = () => {
      if (revealedRef.current) hideReveal();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('scroll', onScroll);
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

  // Fetch the whole card once and cache it. Runs on mount (warm-up) and as a
  // fallback if a hold happens before the warm-up finished. Audited server-side
  // as "opened the card for viewing". Returns the cache (or null on failure).
  const loadCache = useCallback(async () => {
    if (cacheRef.current) return cacheRef.current;
    try {
      const response = await fetch('/api/credit-card/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'all' })
      });
      if (!response.ok) return null;
      const data = (await response.json()) as {
        numberGroups?: string[];
        expiry?: string;
        cvv?: string;
      };
      cacheRef.current = {
        numberGroups: Array.isArray(data.numberGroups) ? data.numberGroups : [],
        expiry: typeof data.expiry === 'string' ? data.expiry : '',
        cvv: typeof data.cvv === 'string' ? data.cvv : ''
      };
      return cacheRef.current;
    } catch {
      return null;
    }
  }, []);

  // Warm the cache as soon as the view mounts so the first hold is instant.
  useEffect(() => {
    void loadCache();
  }, [loadCache]);

  const valueFromCache = useCallback(
    (cache: { numberGroups: string[]; expiry: string; cvv: string }, kind: RevealKind, index: number) => {
      if (kind === 'number') return cache.numberGroups[index] ?? '';
      if (kind === 'cvv') return cache.cvv;
      return cache.expiry;
    },
    []
  );

  const showRevealed = useCallback(
    (kind: RevealKind, index: number, value: string) => {
      if (kind === 'expiry') setRevealed({ kind: 'expiry', value });
      else if (kind === 'cvv') setRevealed({ kind: 'cvv', index, value });
      else setRevealed({ kind: 'number', index, value });
      clearHideTimer();
      hideTimerRef.current = setTimeout(() => hideReveal(), MAX_HOLD_MS);
    },
    [clearHideTimer, hideReveal]
  );

  // Begin a press-and-hold reveal of exactly one window. Reads from the warmed
  // cache for an INSTANT reveal; if the cache isn't ready yet, loads it once and
  // then shows, but only if the press is still held.
  const startHold = useCallback(
    (kind: RevealKind, index: number) => {
      holdingRef.current = true;
      clearHideTimer();
      setRevealed(null);

      const cache = cacheRef.current;
      if (cache) {
        setLoadingKey(null);
        showRevealed(kind, index, valueFromCache(cache, kind, index));
        return;
      }

      // Cold start: warm the cache, then show if still held.
      setLoadingKey(`${kind}:${index}`);
      void loadCache().then((loaded) => {
        setLoadingKey(null);
        if (!loaded || !holdingRef.current) return;
        showRevealed(kind, index, valueFromCache(loaded, kind, index));
      });
    },
    [clearHideTimer, loadCache, showRevealed, valueFromCache]
  );

  const dismissReminder = useCallback(() => {
    setReminderOpen(false);
    void fetch('/api/credit-card/first-viewed', { method: 'POST' }).catch(() => {
      // Best-effort: worst case the reminder shows once more next time.
    });
  }, []);

  // Hold the CVV button to reveal the full CVV for as long as it's held.
  const startCvvHold = useCallback(() => {
    if (cvvLength <= 0) return;
    startHold('cvv', 0);
  }, [cvvLength, startHold]);

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
  // The watermark is always present but ramps up over the digits the moment
  // anything is revealed, so a capture of a held value is always clearly stamped.
  const watermarkOpacity = revealed ? 0.42 : 0.22;

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
            opacity: watermarkOpacity,
            transition: 'opacity 120ms ease',
            transform: 'rotate(-24deg)'
          }}
        >
          <div style={{ animation: 'secure-card-wm 9s linear infinite' }}>
            {Array.from({ length: 12 }).map((_, row) => (
              <div
                key={row}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  lineHeight: '1.8rem',
                  color: '#ffffff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
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
                  onPointerDown={() => void startHold('number', group)}
                  onPointerUp={hideReveal}
                  onPointerLeave={hideReveal}
                  onPointerCancel={hideReveal}
                  onContextMenu={blockContextMenu}
                  title="Press and hold to reveal these 4 digits"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    font: 'inherit',
                    letterSpacing: 'inherit',
                    cursor: 'pointer',
                    padding: 0,
                    touchAction: 'none',
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
                  onPointerDown={() => void startHold('expiry', 0)}
                  onPointerUp={hideReveal}
                  onPointerLeave={hideReveal}
                  onPointerCancel={hideReveal}
                  onContextMenu={blockContextMenu}
                  title="Press and hold to reveal the expiry"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    padding: 0,
                    touchAction: 'none'
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
                    onPointerDown={() => startCvvHold()}
                    onPointerUp={hideReveal}
                    onPointerLeave={hideReveal}
                    onPointerCancel={hideReveal}
                    onContextMenu={blockContextMenu}
                    title="Press and hold to reveal the CVV"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                      fontFamily: 'monospace',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      padding: 0,
                      touchAction: 'none',
                      letterSpacing: '0.3em'
                    }}
                  >
                    {cvvRevealed ? cvvRevealed.value : '•'.repeat(cvvLength)}
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
          <strong>Press and hold</strong> a group of digits, the expiry, or the CVV to reveal it — it
          shows only while held and hides the instant you let go. Only one piece is ever shown at a time.
          Your name, email, and the current time are watermarked across the card, so any screenshot is
          traceable to you. Capturing or copying card details is a bannable misuse of club funds.
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
