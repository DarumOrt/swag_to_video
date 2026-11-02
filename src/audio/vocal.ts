import type { TimeRange } from '@/shared'
import { percentile } from './util'

/** Averaging window for vocal-band energy. */
const SMOOTH_SEC = 0.5
/** Active when the smoothed energy is within this many dB of the loud parts of the track. */
const RELATIVE_DB = 18
/** Never active below this absolute level (dBFS). */
const ABSOLUTE_FLOOR_DB = -55
const MERGE_GAP_SEC = 1
const MIN_REGION_SEC = 0.3
const PAD_SEC = 0.2

/**
 * Cheap heuristic: regions where vocal-band (200 Hz–4 kHz) energy is close to the track's loud
 * level. Errs toward "active" — a false positive only costs recognition time, a miss loses words.
 * `bandPower` is linear power per frame, normalized so a full-scale sine is 1.
 */
export function detectVocalActivity(
  bandPower: Float64Array,
  rate: number,
  durationSec: number,
): TimeRange[] {
  const n = bandPower.length
  const radius = Math.max(1, Math.round((SMOOTH_SEC * rate) / 2))
  const smoothedDb = new Float64Array(n)
  let sum = 0
  let count = 0
  // Sliding window [i - radius, i + radius].
  for (let i = 0; i < Math.min(radius, n); i++) {
    sum += bandPower[i]!
    count++
  }
  for (let i = 0; i < n; i++) {
    const add = i + radius
    if (add < n) {
      sum += bandPower[add]!
      count++
    }
    const remove = i - radius - 1
    if (remove >= 0) {
      sum -= bandPower[remove]!
      count--
    }
    const mean = Math.max(sum, 0) / count
    smoothedDb[i] = mean > 0 ? 10 * Math.log10(mean) : -Infinity
  }

  const loud = percentile(smoothedDb, 0.95)
  if (!Number.isFinite(loud)) return []
  const threshold = Math.max(ABSOLUTE_FLOOR_DB, loud - RELATIVE_DB)

  const raw: TimeRange[] = []
  let start = -1
  for (let i = 0; i <= n; i++) {
    const active = i < n && smoothedDb[i]! > threshold
    if (active && start < 0) start = i
    if (!active && start >= 0) {
      raw.push({ start: start / rate, end: i / rate })
      start = -1
    }
  }

  const merged: TimeRange[] = []
  for (const range of raw) {
    const prev = merged[merged.length - 1]
    if (prev && range.start - prev.end < MERGE_GAP_SEC) prev.end = range.end
    else merged.push({ ...range })
  }

  const out: TimeRange[] = []
  for (const range of merged) {
    if (range.end - range.start < MIN_REGION_SEC) continue
    const padded = {
      start: Math.max(0, range.start - PAD_SEC),
      end: Math.min(durationSec, range.end + PAD_SEC),
    }
    const prev = out[out.length - 1]
    if (prev && padded.start <= prev.end) prev.end = padded.end
    else out.push(padded)
  }
  return out
}
