'use client';

import { useEffect, useState } from 'react';

export function CaliperMinigame({
  actionPrompt,
  onComplete,
  onCancel
}: {
  actionPrompt: string;
  onComplete: () => void;
  onCancel?: () => void;
}) {
  // Pick a random target between 12.0 and 32.0mm in 0.1mm increments, but only
  // after first render — Math.random() during render breaks React purity.
  const [target, setTarget] = useState(20.0);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTarget(Math.round((12 + Math.random() * 20) * 10) / 10);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  const [reading, setReading] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const TOLERANCE = 0.15; // ±0.15mm — tight but reachable on a slider

  const diff = reading - target;
  const isAccurate = Math.abs(diff) <= TOLERANCE;
  const isClose = !isAccurate && Math.abs(diff) <= 1.0;

  const handleConfirm = () => {
    setAttempts((n) => n + 1);
    if (isAccurate) {
      setConfirmed(true);
      window.setTimeout(onComplete, 700);
    }
  };

  // SVG scale: 1mm = 8 svg units. The bracket is drawn at scale; jaws move
  // outward with the reading. Caliper graphic stays inside a 480x190 viewBox.
  const mmToSvg = 8;
  const center = 240;
  const partHalf = (target * mmToSvg) / 2;
  const jawHalf = (reading * mmToSvg) / 2;

  return (
    <div className="mg-backdrop">
      <div className="mg-card cal-card">
        <div className="mg-head">
          <p className="mg-eyebrow">Build step</p>
          <h3 className="mg-title">{actionPrompt}</h3>
          <p className="mg-sub">
            Set the digital caliper jaws to clamp the bracket cleanly. Slide until the display reads <strong>{target.toFixed(1)} mm</strong> (±{TOLERANCE.toFixed(2)}mm tolerance), then confirm.
          </p>
        </div>

        <div className="cal-stage">
          <svg viewBox="0 0 480 200" width="100%" height="190">
            <defs>
              <linearGradient id="cal-steel" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#dadcdf" />
                <stop offset="100%" stopColor="#9ea2a6" />
              </linearGradient>
              <linearGradient id="cal-bracket" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#a78657" />
                <stop offset="100%" stopColor="#7d6543" />
              </linearGradient>
            </defs>

            {/* Caliper main beam with tick marks */}
            <rect x="40" y="22" width="400" height="14" fill="url(#cal-steel)" stroke="#5a5a5a" strokeWidth="1" />
            {Array.from({ length: 41 }).map((_, i) => (
              <line
                key={i}
                x1={40 + i * 10}
                y1="22"
                x2={40 + i * 10}
                y2={i % 5 === 0 ? 36 : 30}
                stroke="#1a1a1a"
                strokeWidth="0.6"
              />
            ))}
            {Array.from({ length: 9 }).map((_, i) => (
              <text
                key={i}
                x={40 + (i + 1) * 50}
                y="50"
                textAnchor="middle"
                fontSize="9"
                fill="#3a3a3a"
              >
                {(i + 1) * 5}
              </text>
            ))}

            {/* Bracket being measured */}
            <rect
              x={center - partHalf}
              y={88}
              width={partHalf * 2}
              height={56}
              fill="url(#cal-bracket)"
              stroke="#3a2515"
              strokeWidth="1.2"
            />
            <text x={center} y={170} textAnchor="middle" fontSize="10" fill="#5a4f3a">
              Bracket
            </text>

            {/* Fixed jaw on the left at the current reading */}
            <rect
              x={center - jawHalf - 7}
              y={56}
              width={7}
              height={50}
              fill="url(#cal-steel)"
              stroke="#5a5a5a"
              strokeWidth="1"
            />
            {/* Moving jaw on the right */}
            <rect
              x={center + jawHalf}
              y={56}
              width={7}
              height={50}
              fill="url(#cal-steel)"
              stroke="#5a5a5a"
              strokeWidth="1"
            />
            {/* Jaw bridges (vertical bars from beam to jaw tips) */}
            <rect x={center - jawHalf - 7} y={36} width={7} height={20} fill="url(#cal-steel)" stroke="#5a5a5a" strokeWidth="0.5" />
            <rect x={center + jawHalf} y={36} width={7} height={20} fill="url(#cal-steel)" stroke="#5a5a5a" strokeWidth="0.5" />

            {/* Digital display */}
            <rect x={center - 50} y={0} width={100} height={20} fill="#1a1a1a" stroke="#0a0a0a" />
            <text
              x={center}
              y={15}
              textAnchor="middle"
              fontSize="13"
              fill={isAccurate ? '#7aff9a' : '#7aa478'}
              fontWeight="700"
              fontFamily="ui-monospace, monospace"
              style={{ filter: 'drop-shadow(0 0 4px rgba(122,164,120,0.7))' }}
            >
              {reading.toFixed(1)} mm
            </text>
          </svg>
        </div>

        <div className="cal-controls">
          <label className="cal-label">Jaw width</label>
          <input
            className="cal-slider"
            type="range"
            min="0"
            max="50"
            step="0.1"
            value={reading}
            onChange={(e) => setReading(parseFloat(e.target.value))}
            disabled={confirmed}
          />
          <div className="cal-readout">
            <span className="cal-current">{reading.toFixed(1)} mm</span>
            <span
              className={
                'cal-diff ' +
                (isAccurate ? 'is-good' : isClose ? 'is-warn' : 'is-bad')
              }
            >
              {isAccurate
                ? '✓ Within tolerance'
                : diff > 0
                  ? `${diff.toFixed(1)} mm too wide`
                  : `${(-diff).toFixed(1)} mm too narrow`}
            </span>
          </div>
        </div>

        <div className="mg-foot">
          <div className="mg-stats">
            <span>Target: <strong>{target.toFixed(1)} mm</strong></span>
            <span>Attempts: <strong>{attempts}</strong></span>
          </div>
          <div className="cal-actions">
            <button
              type="button"
              className="button-primary"
              onClick={handleConfirm}
              disabled={!isAccurate || confirmed}
            >
              {confirmed ? 'Recorded' : 'Confirm measurement'}
            </button>
            {onCancel ? (
              <button type="button" className="button-ghost" onClick={onCancel}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
