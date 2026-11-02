/**
 * ITU-R BS.1770 K-weighting and short-term loudness.
 * Filter coefficients are derived for any sample rate from the analog prototype parameters
 * (same derivation as the BS.1770 reference values at 48 kHz).
 */

export interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

export const LUFS_FLOOR = -70
export const SHORT_TERM_WINDOW_SEC = 3

export function kWeightingFilters(sampleRate: number): [Biquad, Biquad] {
  // Stage 1: high shelf (head acoustics).
  const f0 = 1681.974450955533
  const gainDb = 3.999843853973347
  const q = 0.7071752369554196
  const k = Math.tan((Math.PI * f0) / sampleRate)
  const vh = Math.pow(10, gainDb / 20)
  const vb = Math.pow(vh, 0.4996667741545416)
  const a0 = 1 + k / q + k * k
  const shelf: Biquad = {
    b0: (vh + (vb * k) / q + k * k) / a0,
    b1: (2 * (k * k - vh)) / a0,
    b2: (vh - (vb * k) / q + k * k) / a0,
    a1: (2 * (k * k - 1)) / a0,
    a2: (1 - k / q + k * k) / a0,
  }

  // Stage 2: RLB high-pass.
  const f1 = 38.13547087602444
  const q1 = 0.5003270373238773
  const k1 = Math.tan((Math.PI * f1) / sampleRate)
  const a01 = 1 + k1 / q1 + k1 * k1
  const highPass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k1 * k1 - 1)) / a01,
    a2: (1 - k1 / q1 + k1 * k1) / a01,
  }
  return [shelf, highPass]
}

/**
 * Sum of K-weighted squared samples (over channels) per frame segment
 * [floor(i * hop), floor((i + 1) * hop)), where hop = sampleRate / rate.
 */
export function kWeightedSegmentEnergy(
  channels: readonly Float32Array[],
  sampleRate: number,
  rate: number,
  frameCount: number,
): Float64Array {
  const energy = new Float64Array(frameCount)
  const [s, h] = kWeightingFilters(sampleRate)
  const hop = sampleRate / rate
  for (const x of channels) {
    // Direct form I state for both stages.
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0,
      z1 = 0,
      z2 = 0
    let segment = 0
    let segmentEnd = Math.floor(hop)
    for (let i = 0; i < x.length; i++) {
      const v = x[i]!
      const y = s.b0 * v + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2
      x2 = x1
      x1 = v
      const z = h.b0 * y + h.b1 * y1 + h.b2 * y2 - h.a1 * z1 - h.a2 * z2
      y2 = y1
      y1 = y
      z2 = z1
      z1 = z
      while (i >= segmentEnd) {
        segment++
        segmentEnd = Math.floor((segment + 1) * hop)
      }
      if (segment < frameCount) energy[segment] = energy[segment]! + z * z
    }
  }
  return energy
}

/** Short-term (3 s, trailing) loudness per frame in LUFS, clamped to LUFS_FLOOR. */
export function shortTermLoudness(
  segmentEnergy: Float64Array,
  sampleRate: number,
  rate: number,
): Float32Array {
  const frameCount = segmentEnergy.length
  const out = new Float32Array(frameCount)
  const hop = sampleRate / rate
  const windowFrames = Math.round(SHORT_TERM_WINDOW_SEC * rate)
  let sum = 0
  for (let i = 0; i < frameCount; i++) {
    sum += segmentEnergy[i]!
    if (i >= windowFrames) sum -= segmentEnergy[i - windowFrames]!
    const first = Math.max(0, i - windowFrames + 1)
    const samples = Math.floor((i + 1) * hop) - Math.floor(first * hop)
    const meanSquare = samples > 0 ? Math.max(sum, 0) / samples : 0
    const lufs = meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : LUFS_FLOOR
    out[i] = Math.max(LUFS_FLOOR, lufs)
  }
  return out
}
