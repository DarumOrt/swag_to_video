/** Test helpers (not exported from index). */
import { expect } from 'vitest'
import type { Lyrics } from '@/shared'
import type { RecognizedWord } from './align'
import { flattenWords } from './model'

/** [text, start, end, confidence?] tuples → recognized words. */
export function rec(...words: Array<[string, number, number, number?]>): RecognizedWord[] {
  return words.map(([text, start, end, confidence = 0.9]) => ({ text, start, end, confidence }))
}

/** Evenly spaced recognized words: `step` seconds per word starting at `t0`. */
export function recEven(text: string, t0: number, step: number): RecognizedWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ text: w, start: t0 + i * step, end: t0 + (i + 0.8) * step, confidence: 0.9 }))
}

export function timesOf(
  lyrics: Lyrics,
): Array<[string, number | null, number | null, string | null]> {
  return flattenWords(lyrics).map(({ word }) => [
    word.text,
    word.start,
    word.end,
    word.timingSource,
  ])
}

export function wordByText(lyrics: Lyrics, text: string, occurrence = 0) {
  const found = flattenWords(lyrics).filter((r) => r.word.text === text)[occurrence]
  if (!found) throw new Error(`no word "${text}" #${occurrence}`)
  return found.word
}

/** Every word timed, starts increasing, positive durations, no overlaps. */
export function expectPlayable(lyrics: Lyrics, minWordSec = 0.06): void {
  const words = flattenWords(lyrics).map((r) => r.word)
  words.forEach((w, i) => {
    expect(w.start, `start of "${w.text}"`).not.toBeNull()
    expect(w.end, `end of "${w.text}"`).not.toBeNull()
    expect(w.end! - w.start!).toBeGreaterThanOrEqual(minWordSec - 1e-9)
    const next = words[i + 1]
    if (next) {
      expect(next.start!, `"${next.text}" after "${w.text}"`).toBeGreaterThan(w.start!)
      expect(w.end!).toBeLessThanOrEqual(next.start! + 1e-9)
    }
  })
}
