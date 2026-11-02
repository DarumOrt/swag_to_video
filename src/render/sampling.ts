/**
 * Mapping output frames to timeline data. Pure functions, no canvas.
 */

import type { FrameFeatures } from '@/shared'

/** Time of output frame `frameIndex`, seconds. */
export function frameTime(frameIndex: number, fps: number): number {
  return frameIndex / fps
}

/**
 * Fractional position on the feature grid for an output frame, clamped to [0, frameCount - 1].
 * Computed as frameIndex * rate / fps (not time * rate) so integer ratios stay exact:
 * with fps === rate the result equals `featureIndexAt` from the contract.
 */
export function featurePosition(features: FrameFeatures, frameIndex: number, fps: number): number {
  const pos = (frameIndex * features.rate) / fps
  return Math.min(Math.max(pos, 0), Math.max(features.frameCount - 1, 0))
}

/** Linear interpolation of a per-frame feature array at a fractional position. */
export function sampleSeries(series: ArrayLike<number>, pos: number): number {
  const n = series.length
  if (n === 0) return 0
  const p = Math.min(Math.max(pos, 0), n - 1)
  const i0 = Math.floor(p)
  const i1 = Math.min(i0 + 1, n - 1)
  const frac = p - i0
  const a = series[i0] ?? 0
  const b = series[i1] ?? 0
  return a + (b - a) * frac
}

/** Interpolated spectrum row at a fractional position, written into `out` (length = binCount). */
export function sampleSpectrum(features: FrameFeatures, pos: number, out: Float32Array): void {
  const { binCount, data } = features.spectrum
  const n = features.frameCount
  if (n === 0) {
    out.fill(0)
    return
  }
  const p = Math.min(Math.max(pos, 0), n - 1)
  const i0 = Math.floor(p)
  const i1 = Math.min(i0 + 1, n - 1)
  const frac = p - i0
  const o0 = i0 * binCount
  const o1 = i1 * binCount
  for (let b = 0; b < binCount; b++) {
    const a = data[o0 + b] ?? 0
    out[b] = a + ((data[o1 + b] ?? 0) - a) * frac
  }
}
