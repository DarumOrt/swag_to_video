/**
 * Onset magnet: pulls word starts onto the nearest vocal-band onset within a small window.
 */
import type { Lyrics, TimingSource } from '@/shared'
import { flattenWords, withWords } from './model'
import { DEFAULT_TIMING, sanitizeTimings } from './timing'

export interface SnapOptions {
  /** Max distance from a word start to an onset, seconds. */
  windowSec: number
  minWordSec: number
  /** Which timings may move. User-made ('manual', 'tap') stay put by default. */
  sources: readonly TimingSource[]
}

export const DEFAULT_SNAP: SnapOptions = {
  windowSec: 0.08,
  minWordSec: DEFAULT_TIMING.minWordSec,
  sources: ['whisper', 'aligned', 'interpolated', 'snapped'],
}

/** Nearest value to `t` within `window` in an ascending array, or null. */
export function nearestOnset(onsets: ArrayLike<number>, t: number, window: number): number | null {
  let lo = 0
  let hi = onsets.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (onsets[mid]! < t) lo = mid + 1
    else hi = mid
  }
  let best: number | null = null
  for (const k of [lo - 1, lo]) {
    if (k < 0 || k >= onsets.length) continue
    const candidate = onsets[k]!
    if (
      Math.abs(candidate - t) <= window &&
      (best === null || Math.abs(candidate - t) < Math.abs(best - t))
    ) {
      best = candidate
    }
  }
  return best
}

/**
 * Moves eligible word starts to the nearest onset (marks them 'snapped').
 * A snap is skipped if it would reorder words, cut into a non-movable previous word,
 * or leave the word shorter than `minWordSec`. The previous word's end is trimmed if needed.
 * `onsets` must be ascending (e.g. `Rhythm.vocalOnsets`).
 */
export function snapToOnsets(
  lyrics: Lyrics,
  onsets: ArrayLike<number>,
  options: Partial<SnapOptions> = {},
): Lyrics {
  const { windowSec, minWordSec, sources } = { ...DEFAULT_SNAP, ...options }
  const words = flattenWords(lyrics).map((r) => ({ ...r.word }))
  let prev: (typeof words)[number] | null = null
  for (const word of words) {
    if (word.start === null) continue
    const movable = word.timingSource !== null && sources.includes(word.timingSource)
    if (movable) {
      const onset = nearestOnset(onsets, word.start, windowSec)
      let lower = -Infinity
      if (prev?.start != null) lower = prev.start + minWordSec
      if (
        prev &&
        prev.end !== null &&
        !(prev.timingSource && sources.includes(prev.timingSource))
      ) {
        lower = Math.max(lower, prev.end)
      }
      const upper = word.end !== null ? word.end - minWordSec : Infinity
      if (onset !== null && onset >= lower && onset <= upper) {
        word.start = onset
        word.timingSource = 'snapped'
      }
    }
    if (prev && prev.end !== null && prev.end > word.start) prev.end = word.start
    prev = word
  }
  return withWords(lyrics, sanitizeTimings(words, minWordSec))
}
