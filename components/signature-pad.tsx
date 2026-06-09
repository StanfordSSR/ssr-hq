'use client';

import { useEffect, useRef, useState } from 'react';
import type { SignatureStroke } from '@/lib/signature-verify';

// Mouse/trackpad signature capture. Stores the drawing as a PNG data URL and,
// optionally, the raw timed pen strokes (for signature verification).
export function SignaturePad({
  value,
  disabled,
  onChange,
  onStrokesChange,
  actionLabel = 'Sign',
  title = 'Add your signature',
  description = 'Draw your signature in the box below using your mouse or trackpad.',
  altText = 'Signature'
}: {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  onStrokesChange?: (strokes: SignatureStroke[]) => void;
  actionLabel?: string;
  title?: string;
  description?: string;
  altText?: string;
}) {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const strokesRef = useRef<SignatureStroke[]>([]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#171414';
    dirtyRef.current = false;
    strokesRef.current = [];
  }, [open]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    drawingRef.current = true;
    const point = pointFromEvent(event);
    lastRef.current = point;
    strokesRef.current.push([{ x: point.x, y: point.y, t: Math.round(performance.now()) }]);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const last = lastRef.current;
    const next = pointFromEvent(event);
    if (!ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastRef.current = next;
    dirtyRef.current = true;
    const current = strokesRef.current[strokesRef.current.length - 1];
    if (current) current.push({ x: next.x, y: next.y, t: Math.round(performance.now()) });
  };

  const endStroke = () => {
    drawingRef.current = false;
    lastRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirtyRef.current = false;
    strokesRef.current = [];
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !dirtyRef.current) return;
    onChange(canvas.toDataURL('image/png'));
    onStrokesChange?.(strokesRef.current.map((s) => s.map((p) => ({ ...p }))));
    setOpen(false);
  };

  return (
    <div className="eoy-sign">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={altText} className="eoy-sign-preview" />
      ) : (
        <p className="helper eoy-sign-empty">{disabled ? 'Not signed.' : 'Not signed yet.'}</p>
      )}

      {!disabled ? (
        <div className="eoy-sign-actions">
          <button type="button" className="button-secondary" onClick={() => setOpen(true)}>
            {value ? 'Re-sign' : actionLabel}
          </button>
          {value ? (
            <button type="button" className="hq-inline-link" onClick={() => onChange('')}>
              Clear signature
            </button>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="eoy-sign-overlay" role="dialog" aria-modal="true" aria-label={title}>
          <div className="eoy-sign-modal">
            <h3>{title}</h3>
            <p className="helper">{description}</p>
            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              className="eoy-sign-canvas"
              onPointerDown={startStroke}
              onPointerMove={moveStroke}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
            />
            <div className="eoy-sign-modal-actions">
              <button type="button" className="hq-inline-link" onClick={clear}>
                Clear
              </button>
              <div className="eoy-sign-modal-buttons">
                <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button type="button" className="button" onClick={save}>
                  Save signature
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
