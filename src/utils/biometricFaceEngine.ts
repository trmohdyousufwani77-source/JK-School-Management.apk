export async function sha256Hex(input: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Deterministic fallback hash if SubtleCrypto unavailable in non-HTTPS test context
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

export interface CapturedFaceFrameSample {
  descriptorVector: number[]; // 16-zone normalized luminance descriptor
  contrastScore: number; // ensures face-region texture is present (not black/covered lens)
  meanBrightness: number;
}

/**
 * Extracts a privacy-preserving 16-bin structural descriptor from the central oval region of a live video frame.
 * Does NOT save raw face photographs.
 */
export function sampleVideoFaceDescriptor(video: HTMLVideoElement): CapturedFaceFrameSample | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const canvas = document.createElement('canvas');
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Crop central face oval box (middle 54% width x 64% height)
  const cropW = vw * 0.54;
  const cropH = vh * 0.64;
  const sx = (vw - cropW) / 2;
  const sy = (vh - cropH) / 2;

  ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Build 4x4 grid (16 zones) average luminance
  const bins = new Array<number>(16).fill(0);
  const counts = new Array<number>(16).fill(0);
  let totalLum = 0;
  let totalSq = 0;
  const totalPixels = size * size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
      totalLum += lum;
      totalSq += lum * lum;
      const gx = Math.min(3, Math.floor(x / 8));
      const gy = Math.min(3, Math.floor(y / 8));
      const binIdx = gy * 4 + gx;
      bins[binIdx] += lum;
      counts[binIdx] += 1;
    }
  }

  const meanBrightness = totalLum / totalPixels;
  const variance = Math.max(0, totalSq / totalPixels - meanBrightness * meanBrightness);
  const contrastScore = Math.sqrt(variance);

  const rawVector = bins.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));
  const norm = Math.sqrt(rawVector.reduce((acc, v) => acc + v * v, 0)) || 1;
  const descriptorVector = rawVector.map((v) => Number((v / norm).toFixed(5)));

  return {
    descriptorVector,
    contrastScore: Number(contrastScore.toFixed(4)),
    meanBrightness: Number(meanBrightness.toFixed(4)),
  };
}

export function computeVectorMotionDelta(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length || v1.length === 0) return 0;
  let sumAbs = 0;
  for (let i = 0; i < v1.length; i++) {
    sumAbs += Math.abs(v1[i] - v2[i]);
  }
  return Number((sumAbs / v1.length).toFixed(5));
}

export function computeCosineSimilarity(v1: number[], v2: number[]): number {
  if (v1.length !== v2.length || v1.length === 0) return 0;
  let dot = 0;
  let n1 = 0;
  let n2 = 0;
  for (let i = 0; i < v1.length; i++) {
    dot += v1[i] * v2[i];
    n1 += v1[i] * v1[i];
    n2 += v2[i] * v2[i];
  }
  const denom = Math.sqrt(n1) * Math.sqrt(n2);
  if (denom === 0) return 0;
  return Number(Math.max(0, Math.min(1, dot / denom)).toFixed(4));
}

export async function buildBiometricTemplateHash(
  employeeId: string,
  descriptorVector: number[]
): Promise<string> {
  const quantized = descriptorVector.map((v) => Math.round(v * 100)).join(',');
  return sha256Hex(`SM_BIOMETRIC_V1::${employeeId}::${quantized}`);
}
