/**
 * Tap sync: the user plays the track and taps (optionally holding) once per line or per word.
 * The session is an immutable value; the UI feeds it key-down/key-up times from the audio clock.
 */
import type { LyricWord, Lyrics } from '@/shared'
import { flattenWords, withWords } from './model'
import {
  DEFAULT_TIMING,
  type TimingOptions,
  distribute,
  sanitizeTimings,
  wordWeight,
} from './timing'

export type TapMode = 'line' | 'word'

export interface Tap {
  /** Press time = unit start, seconds. */
  time: number
  /** Release time = unit end, if the key was held; null for a short tap. */
  release: number | null
}

export interface TapSession {
  mode: TapMode
  /** Line or word ids to time, in order. taps[k] belongs to unitIds[k]. */
  unitIds: string[]
  taps: Tap[]
}

/** Starts a session covering all lines/words from `fromIndex` (index within that unit kind). */
export function startTapSession(lyrics: Lyrics, mode: TapMode, fromIndex = 0): TapSession {
  const ids =
    mode === 'line' ? lyrics.lines.map((l) => l.id) : flattenWords(lyrics).map((r) => r.word.id)
  return { mode, unitIds: ids.slice(Math.max(fromIndex, 0)), taps: [] }
}

/** Id of the unit the next tap will time, or null when all are done. */
export function nextTapUnit(session: TapSession): string | null {
  return session.unitIds[session.taps.length] ?? null
}

/** Records a press. Ignored when the session is complete or time goes backwards. */
export function recordTap(session: TapSession, time: number): TapSession {
  const last = session.taps.at(-1)
  if (session.taps.length >= session.unitIds.length || (last && time <= last.time)) return session
  return { ...session, taps: [...session.taps, { time, release: null }] }
}

/** Records the release of the last press (hold = explicit end). */
export function recordRelease(session: TapSession, time: number): TapSession {
  const last = session.taps.at(-1)
  if (!last || last.release !== null || time <= last.time) return session
  return { ...session, taps: [...session.taps.slice(0, -1), { ...last, release: time }] }
}

export function undoTap(session: TapSession): TapSession {
  return session.taps.length ? { ...session, taps: session.taps.slice(0, -1) } : session
}

/**
 * Applies taps to lyrics. A unit ends at its release, else at the next tap
 * (capped by `maxSecPerSyllable` so a line before a break doesn't stretch over it).
 * Word mode: tapped words get 'tap'. Line mode: the first word of a line gets 'tap',
 * the rest are spread by syllables ('interpolated'). Untapped units keep their timings.
 */
export function applyTaps(
  lyrics: Lyrics,
  session: TapSession,
  options: Partial<TimingOptions> = {},
): Lyrics {
  const timing = { ...DEFAULT_TIMING, ...options }
  const tapById = new Map(session.taps.map((_, k) => [session.unitIds[k]!, k]))
  const unitEnd = (k: number, weight: number): number => {
    const tap = session.taps[k]!
    if (tap.release !== null) return tap.release
    const cap = tap.time + weight * timing.maxSecPerSyllable
    const next = session.taps[k + 1]
    return next ? Math.min(next.time, cap) : cap
  }
  const tapped = (
    word: LyricWord,
    start: number,
    end: number,
    source: 'tap' | 'interpolated',
  ): LyricWord => ({
    ...word,
    start,
    end,
    confidence: null,
    timingSource: source,
  })

  let words: LyricWord[]
  if (session.mode === 'word') {
    words = flattenWords(lyrics).map(({ word }) => {
      const k = tapById.get(word.id)
      if (k === undefined) return word
      return tapped(word, session.taps[k]!.time, unitEnd(k, wordWeight(word.text)), 'tap')
    })
  } else {
    words = lyrics.lines.flatMap((line) => {
      const k = tapById.get(line.id)
      if (k === undefined) return line.words
      const weights = line.words.map((w) => wordWeight(w.text))
      const start = session.taps[k]!.time
      const end = unitEnd(
        k,
        weights.reduce((a, b) => a + b, 0),
      )
      const slots = distribute(weights, new Array(weights.length + 1).fill(0), start, end)
      return line.words.map((w, i) =>
        tapped(w, slots[i]!.start, slots[i]!.end, i === 0 ? 'tap' : 'interpolated'),
      )
    })
  }
  return withWords(lyrics, sanitizeTimings(words, timing.minWordSec))
}
