'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Drive = 'phillips' | 'flat' | 'hex' | 'torx' | 'square' | 'triangle';

const ALL_DRIVES: Drive[] = ['phillips', 'flat', 'hex', 'torx', 'square', 'triangle'];

const DRIVE_LABELS: Record<Drive, string> = {
  phillips: 'Phillips',
  flat: 'Flat',
  hex: 'Hex',
  torx: 'Torx T20',
  square: 'Robertson',
  triangle: 'Tri-wing'
};

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function torxPath(): string {
  // 12-point alternating-radius polygon for a 6-pointed Torx star
  const pts: string[] = [];
  for (let i = 0; i < 12; i++) {
    const r = i % 2 === 0 ? 20 : 9;
    const angle = (i * Math.PI) / 6 - Math.PI / 2;
    pts.push(`${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

const DRIVE_PATHS: Record<Drive, string> = {
  phillips: 'M-3 -20 L3 -20 L3 -3 L20 -3 L20 3 L3 3 L3 20 L-3 20 L-3 3 L-20 3 L-20 -3 L-3 -3 Z',
  flat: 'M-22 -3 L22 -3 L22 3 L-22 3 Z',
  hex: 'M20 0 L10 17.32 L-10 17.32 L-20 0 L-10 -17.32 L10 -17.32 Z',
  torx: torxPath(),
  square: 'M-15 -15 L15 -15 L15 15 L-15 15 Z',
  triangle: 'M0 -20 L17.32 10 L-17.32 10 Z'
};

function DriveCutout({ drive, size = 60, color = '#1a1410' }: { drive: Drive; size?: number; color?: string }) {
  return (
    <svg viewBox="-30 -30 60 60" width={size} height={size}>
      <path d={DRIVE_PATHS[drive]} fill={color} />
    </svg>
  );
}

function ScrewHead({ drive, matched }: { drive: Drive; matched: boolean }) {
  return (
    <div className={`mg-screw ${matched ? 'is-matched' : ''}`}>
      <svg viewBox="-50 -50 100 100" width={84} height={84}>
        <defs>
          <radialGradient id={`screw-${drive}`} cx="35%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#f2eee4" />
            <stop offset="55%" stopColor="#bdb3a0" />
            <stop offset="100%" stopColor="#7d735e" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="0" r="44" fill={`url(#screw-${drive})`} stroke="#5a4f3a" strokeWidth="1.5" />
        <circle cx="0" cy="0" r="44" fill="none" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="1" />
        <path d={DRIVE_PATHS[drive]} fill="#1a1410" />
      </svg>
      <div className="mg-screw-label">{DRIVE_LABELS[drive]}</div>
    </div>
  );
}

function DriverBit({
  drive,
  used,
  dragging,
  onPointerDown
}: {
  drive: Drive;
  used: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`mg-bit ${used ? 'is-used' : ''} ${dragging ? 'is-dragging' : ''}`}
      onPointerDown={used ? undefined : onPointerDown}
      disabled={used}
    >
      <div className="mg-bit-shaft" />
      <div className="mg-bit-tip">
        <DriveCutout drive={drive} size={52} color="#e6dfd0" />
      </div>
      <div className="mg-bit-label">{DRIVE_LABELS[drive]}</div>
    </button>
  );
}

export function BuildMinigame({
  actionPrompt,
  onComplete,
  onCancel
}: {
  actionPrompt: string;
  onComplete: () => void;
  onCancel?: () => void;
}) {
  // Each round of the minigame uses all 6 drives. Screws are in a random order on top;
  // driver bits are in a different random order below.
  const screws = useMemo(() => shuffle(ALL_DRIVES), []);
  const bits = useMemo(() => shuffle(ALL_DRIVES), []);

  const [usedBits, setUsedBits] = useState<Record<Drive, boolean>>({
    phillips: false,
    flat: false,
    hex: false,
    torx: false,
    square: false,
    triangle: false
  });
  const [matchedScrews, setMatchedScrews] = useState<Record<Drive, boolean>>({
    phillips: false,
    flat: false,
    hex: false,
    torx: false,
    square: false,
    triangle: false
  });
  const [dragging, setDragging] = useState<{ drive: Drive; x: number; y: number } | null>(null);
  const [wrongFlash, setWrongFlash] = useState<Drive | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [wrong, setWrong] = useState(0);

  const screwRefs = useRef<Map<Drive, HTMLDivElement>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);

  const allMatched = ALL_DRIVES.every((d) => matchedScrews[d]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      setDragging((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : null));
    };
    const onUp = (e: PointerEvent) => {
      const drive = dragging.drive;
      const x = e.clientX;
      const y = e.clientY;
      // Hit-test against screws
      let dropped: Drive | null = null;
      screwRefs.current.forEach((el, sd) => {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          dropped = sd;
        }
      });
      setAttempts((n) => n + 1);
      if (dropped === drive) {
        setMatchedScrews((prev) => ({ ...prev, [drive]: true }));
        setUsedBits((prev) => ({ ...prev, [drive]: true }));
      } else if (dropped) {
        setWrong((n) => n + 1);
        setWrongFlash(dropped);
        window.setTimeout(() => setWrongFlash(null), 350);
      }
      setDragging(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging]);

  useEffect(() => {
    if (allMatched) {
      const t = window.setTimeout(() => onComplete(), 600);
      return () => window.clearTimeout(t);
    }
  }, [allMatched, onComplete]);

  return (
    <div className="mg-backdrop">
      <div className="mg-card" ref={boardRef}>
        <div className="mg-head">
          <p className="mg-eyebrow">Build step</p>
          <h3 className="mg-title">{actionPrompt}</h3>
          <p className="mg-sub">
            Drag each driver bit onto the screw with the matching drive. Match all six to complete the step.
          </p>
        </div>

        <div className="mg-screws">
          {screws.map((d) => (
            <div
              key={`s-${d}`}
              ref={(el) => {
                if (el) screwRefs.current.set(d, el);
                else screwRefs.current.delete(d);
              }}
              className={`mg-screw-slot ${wrongFlash === d ? 'is-wrong' : ''} ${matchedScrews[d] ? 'is-matched' : ''}`}
            >
              <ScrewHead drive={d} matched={matchedScrews[d]} />
            </div>
          ))}
        </div>

        <div className="mg-divider" />

        <div className="mg-bits">
          {bits.map((d) => (
            <DriverBit
              key={`b-${d}`}
              drive={d}
              used={usedBits[d]}
              dragging={dragging?.drive === d}
              onPointerDown={(e) => setDragging({ drive: d, x: e.clientX, y: e.clientY })}
            />
          ))}
        </div>

        <div className="mg-foot">
          <div className="mg-stats">
            <span>Matched: <strong>{ALL_DRIVES.filter((d) => matchedScrews[d]).length}/6</strong></span>
            <span>Wrong attempts: <strong>{wrong}</strong></span>
            <span>Total: <strong>{attempts}</strong></span>
          </div>
          {onCancel ? (
            <button type="button" className="button-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {dragging ? (
        <div
          className="mg-drag-ghost"
          style={{ left: dragging.x, top: dragging.y }}
        >
          <div className="mg-bit-tip">
            <DriveCutout drive={dragging.drive} size={56} color="#e6dfd0" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
