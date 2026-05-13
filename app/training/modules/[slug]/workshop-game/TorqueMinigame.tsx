'use client';

import { useEffect, useState } from 'react';

// Cross / star pattern for 6 bolts arranged hexagonally — alternates across
// the part so it seats evenly. Real engineering practice for any flanged
// joint (wheels, motor flanges, cylinder heads).
const ORDER = [1, 4, 2, 5, 3, 6];

const BOLT_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 0, y: -1.0 },       // 1 — top
  { x: 0.87, y: -0.5 },    // 2 — top-right
  { x: 0.87, y: 0.5 },     // 3 — bottom-right
  { x: 0, y: 1.0 },        // 4 — bottom
  { x: -0.87, y: 0.5 },    // 5 — bottom-left
  { x: -0.87, y: -0.5 }    // 6 — top-left
];

export function TorqueMinigame({
  actionPrompt,
  onComplete,
  onCancel
}: {
  actionPrompt: string;
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [tightened, setTightened] = useState<Set<number>>(new Set());
  const [wrongBolt, setWrongBolt] = useState<number | null>(null);
  const [wrongCount, setWrongCount] = useState(0);

  const nextBolt = ORDER[step];
  const done = step >= ORDER.length;

  useEffect(() => {
    if (done) {
      const t = window.setTimeout(onComplete, 700);
      return () => window.clearTimeout(t);
    }
  }, [done, onComplete]);

  const handleClick = (boltNum: number) => {
    if (tightened.has(boltNum)) return;
    if (boltNum === nextBolt) {
      setTightened((prev) => {
        const next = new Set(prev);
        next.add(boltNum);
        return next;
      });
      setStep((s) => s + 1);
    } else {
      setWrongBolt(boltNum);
      setWrongCount((n) => n + 1);
      window.setTimeout(() => setWrongBolt(null), 380);
    }
  };

  return (
    <div className="mg-backdrop">
      <div className="mg-card tq-card">
        <div className="mg-head">
          <p className="mg-eyebrow">Build step</p>
          <h3 className="mg-title">{actionPrompt}</h3>
          <p className="mg-sub">
            Tighten the bolts in a <strong>star pattern</strong> so the bracket seats evenly — never go around the circle in order, or you&apos;ll warp the part. Follow the numbered sequence:{' '}
            <strong>{ORDER.join(' → ')}</strong>.
          </p>
        </div>

        <div className="tq-board">
          <svg viewBox="-1.7 -1.7 3.4 3.4" width="320" height="320">
            {/* Mounting plate */}
            <rect
              x="-1.4"
              y="-1.4"
              width="2.8"
              height="2.8"
              rx="0.12"
              fill="url(#tq-plate-fill)"
              stroke="#2a2a2a"
              strokeWidth="0.04"
            />
            <defs>
              <radialGradient id="tq-plate-fill" cx="50%" cy="40%" r="65%">
                <stop offset="0%" stopColor="#7a7a7a" />
                <stop offset="100%" stopColor="#3a3a3a" />
              </radialGradient>
            </defs>

            {/* Connection lines hinting at the star pattern (faint) */}
            <g stroke="#ffd34a" strokeWidth="0.018" strokeDasharray="0.04 0.06" opacity="0.35" fill="none">
              {ORDER.slice(0, ORDER.length - 1).map((b, i) => {
                const from = BOLT_POSITIONS[b - 1];
                const to = BOLT_POSITIONS[ORDER[i + 1] - 1];
                return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
              })}
            </g>

            {/* Bolts */}
            {BOLT_POSITIONS.map((pos, i) => {
              const num = i + 1;
              const isDone = tightened.has(num);
              const isNext = num === nextBolt && !done;
              const isWrong = wrongBolt === num;
              const orderIdx = ORDER.indexOf(num);
              return (
                <g
                  key={num}
                  transform={`translate(${pos.x} ${pos.y})${isDone ? ' rotate(45)' : ''}`}
                  onClick={() => handleClick(num)}
                  style={{ cursor: done || isDone ? 'default' : 'pointer' }}
                  className={`tq-bolt ${isWrong ? 'is-wrong' : ''}`}
                >
                  {/* Bolt head (hex) */}
                  <polygon
                    points="0.28,0 0.14,0.24 -0.14,0.24 -0.28,0 -0.14,-0.24 0.14,-0.24"
                    fill={isDone ? '#0e6b4e' : isWrong ? '#b03a1f' : '#4a4a4a'}
                    stroke={isNext ? '#ffd34a' : '#1a1a1a'}
                    strokeWidth={isNext ? 0.05 : 0.025}
                  />
                  {/* Bolt center dot */}
                  <circle r="0.06" fill={isDone ? '#0a4a36' : '#1a1a1a'} />
                  {/* Number */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="0.22"
                    fill="#ffffff"
                    fontWeight="800"
                  >
                    {num}
                  </text>
                  {/* Order badge */}
                  <text
                    x={pos.x > 0 ? 0.34 : pos.x < 0 ? -0.34 : 0}
                    y={pos.y > 0 ? 0.42 : -0.42}
                    textAnchor="middle"
                    fontSize="0.14"
                    fill="#ffd34a"
                    fontWeight="700"
                  >
                    {orderIdx + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <p className="tq-hint">
          {done
            ? 'All bolts torqued — the bracket is seated evenly.'
            : `Next: tighten bolt ${nextBolt} (step ${step + 1} of ${ORDER.length}).`}
        </p>

        <div className="mg-foot">
          <div className="mg-stats">
            <span>Tightened: <strong>{step}/{ORDER.length}</strong></span>
            <span>Out-of-order: <strong>{wrongCount}</strong></span>
          </div>
          {onCancel ? (
            <button type="button" className="button-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
