'use client';

import { useEffect, useState } from 'react';

type Step = {
  id: string;
  label: string;
  detail: string;
};

const STEPS: Step[] = [
  {
    id: 'mount',
    label: 'Mount the PLA spool on the AMS spindle',
    detail: 'The Bambu H2D pulls filament from the AMS, not directly from a top-mounted spool.'
  },
  {
    id: 'feed',
    label: 'Thread the filament tip into the AMS feeder',
    detail: 'Cut the tip cleanly first so the feeder gear can grab it.'
  },
  {
    id: 'load',
    label: 'Press “Load filament” on the touchscreen',
    detail: 'The Bambu will pull the line through the PTFE tube up to the hot end.'
  },
  {
    id: 'material',
    label: 'Confirm material: PLA',
    detail: 'Pick the correct slicer profile. ABS / ASA / nylon are forbidden in this room.'
  },
  {
    id: 'purge',
    label: 'Wait for the purge to finish',
    detail: 'A few centimetres of filament extrude to clear the last colour.'
  },
  {
    id: 'start',
    label: 'Start the print job',
    detail: 'Confirm the print on the screen.'
  }
];

function FilamentDiagram({ progress }: { progress: number }) {
  // Path: spool (left) → AMS feeder → PTFE arc → extruder → hot end (right)
  const totalLength = 720; // approx SVG path length
  const dashOffset = totalLength * (1 - progress);
  return (
    <svg
      viewBox="0 0 720 160"
      width="100%"
      height="180"
      className="fm-diagram"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="fm-trough" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#cabba0" />
          <stop offset="100%" stopColor="#a89776" />
        </linearGradient>
        <linearGradient id="fm-filament" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#1f5fa6" />
          <stop offset="100%" stopColor="#5ea3e8" />
        </linearGradient>
      </defs>

      {/* Background plate */}
      <rect x="0" y="40" width="720" height="80" rx="14" fill="url(#fm-trough)" stroke="#7a6a4a" />

      {/* Spool */}
      <g transform="translate(70, 80)">
        <circle r="34" fill="#1f5fa6" stroke="#0a3a6a" strokeWidth="2" />
        <circle r="10" fill="#0a0a0a" />
        <text y="60" textAnchor="middle" fontSize="11" fill="#3a2f24" fontWeight="700">
          PLA spool
        </text>
      </g>

      {/* AMS feeder */}
      <g transform="translate(220, 80)">
        <rect x="-32" y="-26" width="64" height="52" rx="6" fill="#3a3a3a" stroke="#1a1a1a" />
        <rect x="-22" y="-20" width="44" height="6" fill="#1f8a4a" />
        <text y="56" textAnchor="middle" fontSize="11" fill="#3a2f24" fontWeight="700">
          AMS feeder
        </text>
      </g>

      {/* Extruder / hot end */}
      <g transform="translate(560, 80)">
        <rect x="-30" y="-30" width="60" height="44" rx="4" fill="#262626" stroke="#1a1a1a" />
        <polygon points="-10,14 10,14 4,32 -4,32" fill="#a8a8a8" />
        <circle cx="0" cy="34" r="3" fill="#ff6a2c" />
        <text y="60" textAnchor="middle" fontSize="11" fill="#3a2f24" fontWeight="700">
          Hot end
        </text>
      </g>

      {/* Print bed */}
      <g transform="translate(660, 80)">
        <rect x="-20" y="20" width="60" height="6" fill="#1a1a1a" />
        <text y="48" textAnchor="middle" fontSize="11" fill="#3a2f24" fontWeight="700">
          Bed
        </text>
      </g>

      {/* Filament path background (faded) */}
      <path
        d="M 104 80 L 188 80 Q 220 80 220 80 L 252 80 Q 320 80 360 30 Q 410 -15 460 30 Q 510 75 560 80 L 626 80"
        fill="none"
        stroke="#7a6a4a"
        strokeWidth="3"
        strokeDasharray="6 4"
        opacity="0.4"
      />

      {/* Filament path filled to current progress */}
      <path
        d="M 104 80 L 188 80 Q 220 80 220 80 L 252 80 Q 320 80 360 30 Q 410 -15 460 30 Q 510 75 560 80 L 626 80"
        fill="none"
        stroke="url(#fm-filament)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={totalLength}
        strokeDashoffset={dashOffset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

export function FilamentMinigame({
  actionPrompt,
  onComplete,
  onCancel
}: {
  actionPrompt: string;
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [wrongClick, setWrongClick] = useState<number | null>(null);
  const [wrongCount, setWrongCount] = useState(0);

  const handleClick = (idx: number) => {
    if (idx < currentStep) return; // already done
    if (idx === currentStep) {
      setCurrentStep(idx + 1);
    } else {
      setWrongClick(idx);
      setWrongCount((n) => n + 1);
      window.setTimeout(() => setWrongClick(null), 350);
    }
  };

  useEffect(() => {
    if (currentStep >= STEPS.length) {
      const t = window.setTimeout(() => onComplete(), 700);
      return () => window.clearTimeout(t);
    }
  }, [currentStep, onComplete]);

  const progress = currentStep / STEPS.length;

  return (
    <div className="mg-backdrop">
      <div className="mg-card fm-card">
        <div className="mg-head">
          <p className="mg-eyebrow">Print job</p>
          <h3 className="mg-title">{actionPrompt}</h3>
          <p className="mg-sub">
            Follow the loading sequence in order. Each step waits on the one before it; clicking out of order won&apos;t advance you.
          </p>
        </div>

        <FilamentDiagram progress={progress} />

        <ol className="fm-steps">
          {STEPS.map((step, idx) => {
            const isDone = idx < currentStep;
            const isCurrent = idx === currentStep;
            const isWrong = wrongClick === idx;
            return (
              <li key={step.id} className={`fm-step ${isDone ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''} ${isWrong ? 'is-wrong' : ''}`}>
                <button type="button" className="fm-step-btn" onClick={() => handleClick(idx)} disabled={isDone}>
                  <span className="fm-step-num">{isDone ? '✓' : idx + 1}</span>
                  <span className="fm-step-text">
                    <span className="fm-step-label">{step.label}</span>
                    <span className="fm-step-detail">{step.detail}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mg-foot">
          <div className="mg-stats">
            <span>Completed: <strong>{currentStep}/{STEPS.length}</strong></span>
            <span>Out-of-order clicks: <strong>{wrongCount}</strong></span>
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
