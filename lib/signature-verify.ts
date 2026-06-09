// Lightweight, dependency-free signature verification.
//
// We capture the actual pen path (strokes of timed points), derive a fixed
// feature vector describing the signature's shape + dynamics, and compare new
// signatures to an enrolled reference profile using a normalized (per-feature
// z-scored) Euclidean distance. No ML model / external service — this runs in
// a plain serverless function, so it is cheap on a free Vercel plan.

export type SignaturePoint = { x: number; y: number; t: number };
export type SignatureStroke = SignaturePoint[];

export type SignatureProfile = {
  mean: number[];
  std: number[];
  threshold: number;
  sampleCount: number;
};

export const MIN_ENROLL_SAMPLES = 4;
export const MIN_SIGNATURE_POINTS = 12;

const DIRECTION_BINS = 8;
const PROFILE_BINS = 8;

// Build the feature vector for one signature. Returns null if there isn't
// enough ink to be meaningful.
export function extractSignatureFeatures(strokes: SignatureStroke[]): number[] | null {
  const points = strokes.flat();
  if (points.length < MIN_SIGNATURE_POINTS) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const nx = (x: number) => (x - minX) / w;
  const ny = (y: number) => (y - minY) / h;

  let pathLen = 0;
  let totalTime = 0;
  let speedSum = 0;
  let speedCount = 0;
  const dirBins = new Array(DIRECTION_BINS).fill(0);

  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      const ax = nx(stroke[i - 1].x);
      const ay = ny(stroke[i - 1].y);
      const bx = nx(stroke[i].x);
      const by = ny(stroke[i].y);
      const dx = bx - ax;
      const dy = by - ay;
      const seg = Math.hypot(dx, dy);
      if (seg <= 0) continue;
      pathLen += seg;
      const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI); // 0..1
      const bin = Math.min(DIRECTION_BINS - 1, Math.floor(angle * DIRECTION_BINS));
      dirBins[bin] += seg;
      const dt = stroke[i].t - stroke[i - 1].t;
      if (dt > 0 && dt < 2000) {
        totalTime += dt;
        speedSum += seg / dt;
        speedCount += 1;
      }
    }
  }
  if (pathLen <= 0) return null;

  // Centroid + ink distribution profiles.
  let cx = 0;
  let cy = 0;
  const colBins = new Array(PROFILE_BINS).fill(0);
  const rowBins = new Array(PROFILE_BINS).fill(0);
  for (const p of points) {
    const x = nx(p.x);
    const y = ny(p.y);
    cx += x;
    cy += y;
    colBins[Math.min(PROFILE_BINS - 1, Math.floor(x * PROFILE_BINS))] += 1;
    rowBins[Math.min(PROFILE_BINS - 1, Math.floor(y * PROFILE_BINS))] += 1;
  }
  cx /= points.length;
  cy /= points.length;

  const features: number[] = [];
  features.push(Math.min(8, w / h)); // aspect ratio (capped)
  features.push(Math.min(12, strokes.length)); // stroke count
  features.push(Math.min(40, pathLen)); // total path length (unit-box)
  features.push(speedCount > 0 ? speedSum / speedCount : 0); // mean speed (unit/ms)
  features.push(Math.min(20000, totalTime) / 1000); // duration seconds (capped)
  features.push(cx);
  features.push(cy);
  for (const b of dirBins) features.push(b / pathLen);
  for (const b of colBins) features.push(b / points.length);
  for (const b of rowBins) features.push(b / points.length);
  return features;
}

function zDistance(v: number[], mean: number[], std: number[]): number {
  let sum = 0;
  for (let j = 0; j < v.length; j += 1) {
    const s = (std[j] || 0) + 0.05; // epsilon guards zero-variance features
    const z = (v[j] - mean[j]) / s;
    sum += z * z;
  }
  return Math.sqrt(sum / v.length);
}

// Build a reference profile from several enrolled signatures.
export function buildSignatureProfile(samples: number[][]): SignatureProfile {
  const dims = samples[0].length;
  const mean = new Array(dims).fill(0);
  for (const s of samples) for (let j = 0; j < dims; j += 1) mean[j] += s[j];
  for (let j = 0; j < dims; j += 1) mean[j] /= samples.length;

  const std = new Array(dims).fill(0);
  for (const s of samples) for (let j = 0; j < dims; j += 1) std[j] += (s[j] - mean[j]) ** 2;
  for (let j = 0; j < dims; j += 1) std[j] = Math.sqrt(std[j] / samples.length);

  // Threshold from how much the enrolled samples vary among themselves.
  const dists = samples.map((s) => zDistance(s, mean, std));
  const dMean = dists.reduce((a, b) => a + b, 0) / dists.length;
  const dVar = dists.reduce((a, b) => a + (b - dMean) ** 2, 0) / dists.length;
  const dStd = Math.sqrt(dVar);
  const threshold = dMean + 2.5 * dStd + 0.6; // lenient, to limit false rejects

  return { mean, std, threshold, sampleCount: samples.length };
}

export function verifySignature(
  profile: SignatureProfile,
  features: number[]
): { ok: boolean; score: number; threshold: number } {
  const score = zDistance(features, profile.mean, profile.std);
  return { ok: score <= profile.threshold, score, threshold: profile.threshold };
}

// Parse the strokes JSON submitted from the client, defensively.
export function parseStrokes(raw: unknown): SignatureStroke[] {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data
      .map((stroke) =>
        Array.isArray(stroke)
          ? stroke
              .filter((p) => p && typeof p.x === 'number' && typeof p.y === 'number')
              .map((p) => ({ x: Number(p.x), y: Number(p.y), t: Number(p.t) || 0 }))
          : []
      )
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}
