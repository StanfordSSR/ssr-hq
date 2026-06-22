'use client';

import { useEffect, useState } from 'react';

// Animated, screenshot-resistant SSR visitor badge. The live ticking clock
// (updated every second) plus the pulsing "● LIVE" dot make any screenshot
// obviously frozen; the moving holographic sheen and pulsing glow reinforce
// that this is a live, rendered credential rather than a static image.
export function VisitorBadge({
  name,
  accessEnd,
  issuerName
}: {
  name: string;
  accessEnd: string;
  issuerName: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Seed and then tick the clock from timer callbacks (never synchronously in
    // the effect body) so the displayed time stays live without cascading
    // renders. The first paint shows a placeholder for one frame.
    const seed = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(seed);
      clearInterval(id);
    };
  }, []);

  const clock = now
    ? now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'America/Los_Angeles'
      })
    : '—';
  const dateLabel = now
    ? now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'America/Los_Angeles'
      })
    : '';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'radial-gradient(circle at 50% 20%, #2a0d0d 0%, #160707 55%, #0b0404 100%)',
        boxSizing: 'border-box'
      }}
    >
      <style>{`
        @keyframes ssr-badge-sheen {
          0% { transform: translateX(-120%) rotate(8deg); opacity: 0.0; }
          25% { opacity: 0.65; }
          50% { transform: translateX(120%) rotate(8deg); opacity: 0.0; }
          100% { transform: translateX(120%) rotate(8deg); opacity: 0.0; }
        }
        @keyframes ssr-badge-glow {
          0%, 100% { box-shadow: 0 0 28px rgba(140,21,21,0.45), 0 18px 60px rgba(0,0,0,0.7); }
          50% { box-shadow: 0 0 54px rgba(196,58,58,0.75), 0 18px 60px rgba(0,0,0,0.7); }
        }
        @keyframes ssr-badge-holo {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes ssr-badge-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(0.82); }
        }
        @keyframes ssr-badge-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          borderRadius: 22,
          padding: 2,
          background:
            'linear-gradient(120deg, #8c1515, #d96a6a, #f3c6c6, #8c1515, #5a0d0d, #d96a6a)',
          backgroundSize: '300% 300%',
          animation: 'ssr-badge-holo 7s ease infinite, ssr-badge-glow 3.4s ease-in-out infinite',
          overflow: 'hidden'
        }}
      >
        {/* Moving holographic sheen overlay */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '55%',
            height: '100%',
            background:
              'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)',
            filter: 'blur(6px)',
            animation: 'ssr-badge-sheen 4.5s linear infinite',
            pointerEvents: 'none',
            zIndex: 3
          }}
        />

        <div
          style={{
            position: 'relative',
            borderRadius: 20,
            background: 'linear-gradient(180deg, #1c0a0a 0%, #2a0e0e 100%)',
            padding: '1.75rem 1.5rem 1.5rem',
            color: '#fbeeee',
            zIndex: 2,
            overflow: 'hidden'
          }}
        >
          {/* Faint rotating conic shimmer behind the content */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-40%',
              left: '-40%',
              width: '180%',
              height: '180%',
              background:
                'conic-gradient(from 0deg, rgba(140,21,21,0) 0deg, rgba(217,106,106,0.18) 90deg, rgba(140,21,21,0) 180deg, rgba(217,106,106,0.18) 270deg, rgba(140,21,21,0) 360deg)',
              animation: 'ssr-badge-rotate 16s linear infinite',
              pointerEvents: 'none',
              zIndex: 0
            }}
          />

          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Header: logo + org */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icon.png"
                alt="Stanford Student Robotics"
                width={44}
                height={44}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: '#fff',
                  padding: 4,
                  boxSizing: 'border-box',
                  flexShrink: 0
                }}
              />
              <div style={{ lineHeight: 1.25 }}>
                <div
                  style={{
                    fontSize: '0.7rem',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: '#f0b6b6',
                    fontWeight: 700
                  }}
                >
                  External Participant
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>Stanford Student Robotics</div>
              </div>
            </div>

            <div
              style={{
                height: 1,
                background: 'linear-gradient(90deg, rgba(240,182,182,0), rgba(240,182,182,0.5), rgba(240,182,182,0))',
                margin: '1.25rem 0'
              }}
            />

            {/* Participant name */}
            <div
              style={{
                fontSize: '0.68rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#c9a9a9',
                marginBottom: '0.3rem'
              }}
            >
              Visitor
            </div>
            <div
              style={{
                fontSize: '1.85rem',
                lineHeight: 1.15,
                fontWeight: 800,
                color: '#ffffff',
                textShadow: '0 1px 12px rgba(217,106,106,0.5)',
                wordBreak: 'break-word'
              }}
            >
              {name}
            </div>

            <div
              style={{
                marginTop: '0.75rem',
                fontSize: '0.85rem',
                color: '#e7c9c9'
              }}
            >
              Valid through <strong style={{ color: '#ffffff' }}>{accessEnd}</strong>
            </div>
            <div style={{ marginTop: '0.2rem', fontSize: '0.78rem', color: '#c9a9a9' }}>
              Authorized by {issuerName}
            </div>

            {/* Live clock + pulsing LIVE dot — the anti-screenshot tell */}
            <div
              style={{
                marginTop: '1.4rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.7rem 0.85rem',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(240,182,182,0.25)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block',
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: '#ff4d4d',
                    boxShadow: '0 0 8px #ff4d4d',
                    animation: 'ssr-badge-pulse 1.1s ease-in-out infinite'
                  }}
                />
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: '#ffb3b3'
                  }}
                >
                  LIVE
                </span>
              </div>
              <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: '#ffffff'
                  }}
                >
                  {clock}
                </div>
                <div style={{ fontSize: '0.62rem', color: '#c9a9a9' }}>{dateLabel} · PT</div>
              </div>
            </div>

            <p
              style={{
                marginTop: '1rem',
                marginBottom: 0,
                fontSize: '0.68rem',
                color: '#a98787',
                textAlign: 'center'
              }}
            >
              This badge is live and animated. A screenshot will not show the moving clock.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
