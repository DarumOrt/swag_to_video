/**
 * Timing helpers shared by alignment, LRC import and tap sync:
 * syllable-weighted distribution and overlap cleanup.
 */
import type { LyricWord } from '@/shared'
import { countSyllables } from './text'

export interface TimingOptions {
  /** Typical sung length of one syllable, used to pack words next to a known time. */
  secPerSyllable: number
  /** Above this per-syllable length a span is treated as containing a pause. */
  maxSecPerSyllable: number
  /** No word is shorter than this, and word starts are at least this far apart. */
  minWordSec: number
  /** Pause between lines, in syllables, when distributing words across a line break. */
  linePauseSyllables: number
}

export const DEFAULT_TIMING: TimingOptions = {
  secPerSyllable: 0.22,
  maxSecPerSyllable: 0.6,
  minWordSec: 0.06,
  linePauseSyllables: 1,
}

/** Duration weight of a word; words without vowels ("в", "с") count as half a syllable. */
export function wordWeight(text: string): number {
  return Math.max(countSyllables(text), 0.5)
}

export interface Slot {
  start: number
  end: number
}

/**
 * Splits [start, end] between items proportionally to `weights`.
 * `pauses` has weights.length + 1 entries: pause before each item and after the last one.
 */
export function distribute(
  weights: readonly number[],
  pauses: readonly number[],
  start: number,
  end: number,
): Slot[] {
  const total = totalWeight(weights, pauses)
  const scale = total > 0 ? Math.max(end - start, 0) / total : 0
  const slots: Slot[] = []
  let t = start
  weights.forEach((weight, i) => {
    t += (pauses[i] ?? 0) * scale
    const slotStart = t
    t += weight * scale
    slots.push({ start: slotStart, end: t })
  })
  return slots
}

export function totalWeight(weights: readonly number[], pauses: readonly number[]): number {
  let total = 0
  for (const w of weights) total += w
  for (const p of pauses) total += p
  return total
}

/**
 * Makes timings playable in reading order: starts strictly increase by at least `minWordSec`,
 * every word lasts at least `minWordSec`, and a word ends no later than the next one starts.
 * Words with no start are skipped; a start without an end gets the minimum duration.
 */
export function sanitizeTimings(words: readonly LyricWord[], minWordSec: number): LyricWord[] {
  const out = words.map((w) => ({ ...w }))
  let prev: LyricWord | null = null
  for (const word of out) {
    if (word.start === null) continue
    if (prev && prev.start !== null) {
      if (word.start < prev.start + minWordSec) word.start = prev.start + minWordSec
      if (prev.end !== null && prev.end > word.start) prev.end = word.start
    }
    if (word.end === null || word.end < word.start + minWordSec) word.end = word.start + minWordSec
    prev = word
  }
  return out
}
