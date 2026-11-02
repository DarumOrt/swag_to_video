/**
 * Editor operations on timed lyrics. Edited timings become 'manual'; neighbours are only trimmed
 * where they would overlap, never reordered or shrunk below `minWordSec`.
 */
import type { LyricWord, Lyrics } from '@/shared'
import { flattenWords, withWords } from './model'
import { type TapMode, type TapSession, startTapSession } from './tap'
import { DEFAULT_TIMING, type TimingOptions, wordWeight } from './timing'

export interface WordEdit {
  /** New display text; ignored when blank. */
  text?: string
  start?: number
  end?: number
}

type EditOptions = Pick<TimingOptions, 'minWordSec' | 'secPerSyllable'>

/** Nearest timed word before / after index `i` in reading order. */
function timedNeighbours(words: readonly LyricWord[], from: number, to = from) {
  let prev: LyricWord | null = null
  let next: LyricWord | null = null
  for (let k = from - 1; k >= 0 && !prev; k--) if (words[k]!.start !== null) prev = words[k]!
  for (let k = to + 1; k < words.length && !next; k++)
    if (words[k]!.start !== null) next = words[k]!
  return { prev, next }
}

/** Trims neighbour ends/starts so [start, end] is free. */
function makeRoom(prev: LyricWord | null, next: LyricWord | null, start: number, end: number) {
  if (prev && prev.end !== null && prev.end > start) prev.end = start
  if (next && next.start !== null && next.start < end) next.start = end
}

/**
 * Changes a word's text and/or timing. Setting `start` or `end` marks the word 'manual'.
 * The new timing is clamped so the previous timed word keeps at least `minWordSec`
 * from its start and the next one at least `minWordSec` before its end.
 * Unknown `wordId` → lyrics returned unchanged.
 */
export function editWord(
  lyrics: Lyrics,
  wordId: string,
  edit: WordEdit,
  options: Partial<EditOptions> = {},
): Lyrics {
  const { minWordSec, secPerSyllable } = { ...DEFAULT_TIMING, ...options }
  const words = flattenWords(lyrics).map((r) => ({ ...r.word }))
  const index = words.findIndex((w) => w.id === wordId)
  if (index < 0) return lyrics
  const word = words[index]!

  const text = edit.text?.trim()
  if (text) word.text = text

  if (edit.start !== undefined || edit.end !== undefined) {
    const estimate = wordWeight(word.text) * secPerSyllable
    let start = edit.start ?? word.start
    let end = edit.end ?? word.end
    if (start === null) start = end! - estimate
    if (end === null) end = start + estimate
    if (end < start + minWordSec) {
      if (edit.start === undefined) start = end - minWordSec
      else end = start + minWordSec
    }

    const { prev, next } = timedNeighbours(words, index)
    const lo = Math.max(prev ? prev.start! + minWordSec : 0, 0)
    const hi = next ? (next.end ?? next.start! + minWordSec) - minWordSec : Infinity
    start = Math.max(start, lo)
    end = Math.min(end, hi)
    if (end < start + minWordSec) {
      end = Math.min(start + minWordSec, hi)
      start = Math.max(end - minWordSec, lo)
    }
    makeRoom(prev, next, start, end)
    Object.assign(word, { start, end, confidence: null, timingSource: 'manual' })
  }
  return withWords(lyrics, words)
}

/**
 * Moves every timed word of a line by `deltaSec` and marks them 'manual'.
 * The shift is clamped so the line stays after the previous timed word's start (and ≥ 0)
 * and before the next timed word's end, keeping `minWordSec` for both.
 */
export function shiftLine(
  lyrics: Lyrics,
  lineId: string,
  deltaSec: number,
  options: Partial<Pick<TimingOptions, 'minWordSec'>> = {},
): Lyrics {
  const { minWordSec } = { ...DEFAULT_TIMING, ...options }
  const refs = flattenWords(lyrics)
  const lineIndex = lyrics.lines.findIndex((l) => l.id === lineId)
  const words = refs.map((r) => ({ ...r.word }))
  const inLine = refs.flatMap((r, i) =>
    r.lineIndex === lineIndex && r.word.start !== null ? [i] : [],
  )
  if (lineIndex < 0 || !inLine.length || !Number.isFinite(deltaSec)) return lyrics

  const first = words[inLine[0]!]!
  const last = words[inLine.at(-1)!]!
  const { prev, next } = timedNeighbours(words, inLine[0]!, inLine.at(-1)!)
  const minDelta = Math.max(prev ? prev.start! + minWordSec : 0, 0) - first.start!
  const lastEnd = last.end ?? last.start!
  const maxDelta = next ? (next.end ?? next.start! + minWordSec) - minWordSec - lastEnd : Infinity
  const delta = Math.min(Math.max(deltaSec, minDelta), Math.max(maxDelta, minDelta))
  if (delta === 0) return lyrics

  for (const i of inLine) {
    const w = words[i]!
    w.start = w.start! + delta
    if (w.end !== null) w.end += delta
    w.confidence = null
    w.timingSource = 'manual'
  }
  makeRoom(prev, next, first.start!, last.end ?? last.start!)
  return withWords(lyrics, words)
}

export interface RetimeResult {
  /** Lyrics with timings cleared from the restart point on. */
  lyrics: Lyrics
  /** Tap session starting at that word (word mode) or its line (line mode). */
  session: TapSession
  /** End of the last timed word before the restart point (seek the player a bit before it), or 0. */
  resumeFromSec: number
}

/**
 * "Restart tap sync from here": clears timings from `wordId` (or from the start of its line in
 * line mode) to the end and returns a fresh tap session for that range.
 * Unknown `wordId` → session over everything, lyrics unchanged.
 */
export function retimeFrom(lyrics: Lyrics, wordId: string, mode: TapMode = 'word'): RetimeResult {
  const refs = flattenWords(lyrics)
  const at = refs.findIndex((r) => r.word.id === wordId)
  if (at < 0) return { lyrics, session: startTapSession(lyrics, mode), resumeFromSec: 0 }

  const lineIndex = refs[at]!.lineIndex
  const from = mode === 'line' ? refs.findIndex((r) => r.lineIndex === lineIndex) : at
  const words = refs.map(({ word }, i) =>
    i < from ? word : { ...word, start: null, end: null, confidence: null, timingSource: null },
  )
  const before = words.slice(0, from).findLast((w) => w.start !== null)
  return {
    lyrics: withWords(lyrics, words),
    session: startTapSession(lyrics, mode, mode === 'line' ? lineIndex : from),
    resumeFromSec: before ? (before.end ?? before.start!) : 0,
  }
}
