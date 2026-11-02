import type { TimeRange } from '@/shared'
import { slidingMedian } from './median'
import { percentile } from './util'

/*
 * Vocal cues without stem separation. The vocal-band spectrogram arrives already reduced to its
 * center-panned part (mid power minus side power: lead vocals sit in the center, pads and
 * doubled instruments spread out). Here we keep only its harmonic part (median-filter HPSS:
 * sustained partials survive a median over time, drum hits survive a median over frequency) and
 * derive an onset envelope and a vocal-activity energy from it.
 */

export const VOCAL_BAND_HZ = [200, 4000] as const

/** HPSS median lengths: ~0.23 s along time, ~0.5 kHz along frequency. */
const HARMONIC_RADIUS_SEC = 0.115
const PERCUSSIVE_RADIUS_HZ = 250
/** Log compression for the vocal onset envelope. */
const VOCAL_FLUX_GAMMA = 300

export interface VocalSpectrogram {
  /** frameCount × binCount power, row-major, normalized like band power (full-scale sine = 1). */
  power: Float32Array
  frameCount: number
  binCount: number
  /** Width of one bin in Hz. */
  binHz: number
}

/** Harmonic part of the spectrogram (soft Wiener-like mask H² / (H² + P²)). */
export function harmonicPart(spec: VocalSpectrogram, rate: number): Float32Array {
  const { power, frameCount, binCount, binHz } = spec
  const harmonic = new Float32Array(power.length)
  const percussive = new Float32Array(power.length)
  const timeRadius = Math.max(1, Math.round(HARMONIC_RADIUS_SEC * rate))
  const freqRadius = Math.max(1, Math.round(PERCUSSIVE_RADIUS_HZ / binHz))
  for (let k = 0; k < binCount; k++) {
    slidingMedian(power, harmonic, frameCount, k, binCount, timeRadius)
  }
  for (let i = 0; i < frameCount; i++) {
    slidingMedian(power, percussive, binCount, i * binCount, 1, freqRadius)
  }
  const out = new Float32Array(power.length)
  for (let i = 0; i < power.length; i++) {
    const h = harmonic[i]!
    const p = percussive[i]!
    const h2 = h * h
    const denominator = h2 + p * p
    out[i] = denominator > 0 ? (power[i]! * h2) / denominator : 0
  }
  return out
}

/** Spectral flux on log amplitude, one value per frame. */
export function fluxEnvelope(
  power: Float32Array,
  frameCount: number,
  binCount: number,
): Float32Array {
  const out = new Float32Array(frameCount)
  const prev = new Float64Array(binCount)
  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let k = 0; k < binCount; k++) {
      const v = Math.log(1 + VOCAL_FLUX_GAMMA * Math.sqrt(power[i * binCount + k]!))
      const d = v - prev[k]!
      if (d > 0) sum += d
      prev[k] = v
    }
    out[i] = sum
  }
  return out
}

/** Sum over bins, one value per frame. */
export function frameEnergy(
  power: Float32Array,
  frameCount: number,
  binCount: number,
): Float64Array {
  const out = new Float64Array(frameCount)
  for (let i = 0; i < frameCount; i++) {
    let sum = 0
    for (let k = 0; k < binCount; k++) sum += power[i * binCount + k]!
    out[i] = sum
  }
  return out
}

/** Centered moving average of `values` over ±radius frames. */
export function movingAverage(values: Float64Array, radius: number): Float64Array {
  const n = values.length
  const out = new Float64Array(n)
  let sum = 0
  let count = 0
  for (let i = 0; i < Math.min(radius, n); i++) {
    sum += values[i]!
    count++
  }
  for (let i = 0; i < n; i++) {
    const add = i + radius
    if (add < n) {
      sum += values[add]!
      count++
    }
    const drop = i - radius - 1
    if (drop >= 0) {
      sum -= values[drop]!
      count--
    }
    out[i] = Math.max(sum, 0) / count
  }
  return out
}

export interface VocalActivityOptions {
  /** Active when the smoothed energy is within this many dB of the track's loud vocal level. */
  relativeDb: number
  /** Never active below this absolute level (dB, full-scale sine = 0). */
  floorDb: number
  /** Averaging window. */
  smoothSec: number
  mergeGapSec: number
  minRegionSec: number
  padSec: number
}

/** For the mix: harmonic center-panned vocal-band energy. */
export const MIX_VOCAL_ACTIVITY: VocalActivityOptions = {
  relativeDb: 14,
  floorDb: -55,
  smoothSec: 0.5,
  mergeGapSec: 1,
  minRegionSec: 0.4,
  padSec: 0.2,
}

/**
 * For an isolated vocal stem: anything clearly above the separation bleed. The absolute floor
 * keeps an instrumental's stem (bleed only) empty.
 */
export const STEM_VOCAL_ACTIVITY: VocalActivityOptions = {
  relativeDb: 30,
  floorDb: -45,
  smoothSec: 0.3,
  mergeGapSec: 0.6,
  minRegionSec: 0.2,
  padSec: 0.15,
}

/**
 * Mix heuristic: the harmonic share of the vocal band must reach this level (smoothed, dB).
 * Measured on real mixes: songs sit around -2…-4 dB most of the time, a synth instrumental around
 * -5 dB (drum-heavy and noisy parts lower). Permissive on purpose.
 */
export const MIX_HARMONIC_RATIO_MIN_DB = -5.5
const RATIO_SMOOTH_SEC = 1

/**
 * Harmonic vocal-band energy, zeroed where the band is mostly not harmonic (drums, noise, dense
 * distorted synths): input for `detectVocalActivity` on a full mix.
 */
export function gateByHarmonicRatio(
  harmonicEnergy: Float64Array,
  bandEnergy: Float64Array,
  rate: number,
): Float64Array {
  const radius = Math.max(1, Math.round((RATIO_SMOOTH_SEC * rate) / 2))
  const h = movingAverage(harmonicEnergy, radius)
  const b = movingAverage(bandEnergy, radius)
  const minRatio = Math.pow(10, MIX_HARMONIC_RATIO_MIN_DB / 10)
  const out = new Float64Array(harmonicEnergy.length)
  for (let i = 0; i < out.length; i++) {
    if (b[i]! > 0 && h[i]! >= minRatio * b[i]!) out[i] = harmonicEnergy[i]!
  }
  return out
}

/** Keeps only the times inside the ranges (both ascending). */
export function timesWithin(times: Float32Array, ranges: readonly TimeRange[]): Float32Array {
  const out: number[] = []
  let r = 0
  for (const t of times) {
    while (r < ranges.length && ranges[r]!.end < t) r++
    const range = ranges[r]
    if (range && t >= range.start) out.push(t)
  }
  return Float32Array.from(out)
}

/**
 * Regions where `energy` (linear, per frame) stays close to the track's loud vocal level (its 95th
 * percentile). Errs toward "active": a false positive only costs recognition time, a miss loses
 * words.
 */
export function detectVocalActivity(
  energy: Float64Array,
  rate: number,
  durationSec: number,
  options: VocalActivityOptions = MIX_VOCAL_ACTIVITY,
): TimeRange[] {
  const n = energy.length
  const smoothed = movingAverage(energy, Math.max(1, Math.round((options.smoothSec * rate) / 2)))
  const db = new Float64Array(n)
  for (let i = 0; i < n; i++) db[i] = smoothed[i]! > 0 ? 10 * Math.log10(smoothed[i]!) : -Infinity

  const loud = percentile(db, 0.95)
  if (!Number.isFinite(loud)) return []
  const threshold = Math.max(options.floorDb, loud - options.relativeDb)

  const raw: TimeRange[] = []
  let start = -1
  for (let i = 0; i <= n; i++) {
    const active = i < n && db[i]! > threshold
    if (active && start < 0) start = i
    if (!active && start >= 0) {
      raw.push({ start: start / rate, end: i / rate })
      start = -1
    }
  }

  const merged: TimeRange[] = []
  for (const range of raw) {
    const prev = merged[merged.length - 1]
    if (prev && range.start - prev.end < options.mergeGapSec) prev.end = range.end
    else merged.push({ ...range })
  }

  const out: TimeRange[] = []
  for (const range of merged) {
    if (range.end - range.start < options.minRegionSec) continue
    const padded = {
      start: Math.max(0, range.start - options.padSec),
      end: Math.min(durationSec, range.end + options.padSec),
    }
    const prev = out[out.length - 1]
    if (prev && padded.start <= prev.end) prev.end = padded.end
    else out.push(padded)
  }
  return out
}
