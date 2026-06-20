import { describe, it, expect } from 'vitest';
import {
  extractSignatureFeatures,
  buildSignatureProfile,
  verifySignature,
  parseStrokes,
  MIN_SIGNATURE_POINTS,
  type SignatureStroke
} from '@/lib/signature-verify';

// A deterministic, distinctive signature shape (a wide zig-zag).
function baseSignature(): SignatureStroke[] {
  const pts = [];
  let t = 0;
  for (let i = 0; i < 24; i += 1) {
    t += 20;
    pts.push({ x: i * 10, y: (i % 2) * 40, t });
  }
  return [pts];
}

// A structurally very different shape (a tall, narrow vertical stroke).
function differentSignature(): SignatureStroke[] {
  const pts = [];
  let t = 0;
  for (let i = 0; i < 24; i += 1) {
    t += 20;
    pts.push({ x: (i % 2) * 1, y: i * 12, t });
  }
  return [pts];
}

describe('parseStrokes', () => {
  it('parses a JSON string of strokes and drops invalid points', () => {
    const raw = JSON.stringify([
      [
        { x: 1, y: 2, t: 0 },
        { x: 3, y: 4, t: 10 },
        { x: 'bad', y: 5, t: 20 }
      ],
      []
    ]);
    const strokes = parseStrokes(raw);
    expect(strokes).toHaveLength(1); // empty stroke dropped
    expect(strokes[0]).toHaveLength(2); // invalid point dropped
    expect(strokes[0][0]).toEqual({ x: 1, y: 2, t: 0 });
  });

  it('returns an empty array for garbage input', () => {
    expect(parseStrokes('not json')).toEqual([]);
    expect(parseStrokes(null)).toEqual([]);
    expect(parseStrokes(42)).toEqual([]);
  });
});

describe('extractSignatureFeatures', () => {
  it('returns null when there is too little ink', () => {
    const tiny: SignatureStroke[] = [[{ x: 0, y: 0, t: 0 }]];
    expect(extractSignatureFeatures(tiny)).toBeNull();
  });

  it('returns a fixed-length feature vector for a real signature', () => {
    const features = extractSignatureFeatures(baseSignature());
    expect(features).not.toBeNull();
    expect(features!.length).toBeGreaterThan(MIN_SIGNATURE_POINTS);
    expect(features!.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('verifySignature', () => {
  it('accepts a matching signature and rejects a clearly different one', () => {
    const enrolled = [baseSignature(), baseSignature(), baseSignature(), baseSignature()]
      .map((s) => extractSignatureFeatures(s))
      .filter((f): f is number[] => Array.isArray(f));
    const profile = buildSignatureProfile(enrolled);

    const sameFeatures = extractSignatureFeatures(baseSignature())!;
    const differentFeatures = extractSignatureFeatures(differentSignature())!;

    const sameResult = verifySignature(profile, sameFeatures);
    const diffResult = verifySignature(profile, differentFeatures);

    expect(sameResult.ok).toBe(true);
    expect(diffResult.ok).toBe(false);
    // The matching signature should always score better than the impostor.
    expect(sameResult.score).toBeLessThan(diffResult.score);
    expect(Number.isFinite(sameResult.threshold)).toBe(true);
  });
});
