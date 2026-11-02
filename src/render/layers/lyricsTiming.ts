/**
 * Pure timing for the lyrics layer: when each line appears, moves and leaves, and how far each word's
 * karaoke fill has progressed. No canvas — everything is a function of time, so any frame can be
 * rendered independently (scrubbing = playback = export).
 *
 * A line moves through "slots": 1 = preview below the current line, 0 = current, -1 = gone above.
 * Slot changes are animated over `transitionSec`.
 */

import type { LyricLine } from '@/shared'

export interface LyricsTimingOptions {
  /** A line becomes current this long before its first word (but not before the previous line ends). */
  leadInSec: number
  /** A line stays current this long after its last word if the next line has not taken over. */
  holdSec: number
  /** Preview of a line that follows a pause appears this long before the line becomes current. */
  previewLeadSec: number
  /** Duration of slot animations (appear, scroll, leave). */
  transitionSec: number
}

export interface TimedWord {
  id: string
  text: string
  start: number
  end: number
  /** false when timing was filled in from neighbours (word had no timing in the timeline). */
  timed: boolean
}

export interface LineTiming {
  /** Index into `lyrics.lines`. */
  lineIndex: number
  id: string
  words: TimedWord[]
  /** First word start / last word end. */
  start: number
  end: number
  previewStart: number
  appear: number
  disappear: number
}

/**
 * Words with effective timing. Untimed words get the gap between their timed neighbours
 * (or are dropped when `keepUntimed` is false). Returns [] for a line without any timed word.
 */
export function timeLineWords(line: LyricLine, keepUntimed: boolean): TimedWord[] {
  const words = line.words
  const timedIdx = words.flatMap((w, i) => (w.start !== null && w.end !== null ? [i] : []))
  if (timedIdx.length === 0) return []
  const out: TimedWord[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (!w) continue
    if (w.start !== null && w.end !== null) {
      out.push({
        id: w.id,
        text: w.text,
        start: w.start,
        end: Math.max(w.end, w.start),
        timed: true,
      })
      continue
    }
    if (!keepUntimed) continue
    const prev = [...timedIdx].reverse().find((j) => j < i)
    const next = timedIdx.find((j) => j > i)
    const from = prev !== undefined ? (words[prev]?.end ?? 0) : (words[next ?? 0]?.start ?? 0)
    const to = next !== undefined ? (words[next]?.start ?? from) : from
    out.push({ id: w.id, text: w.text, start: from, end: Math.max(to, from), timed: false })
  }
  return out
}

export function computeLineTimings(
  lines: LyricLine[],
  o: LyricsTimingOptions,
  keepUntimed = true,
): LineTiming[] {
  const timed = lines
    .map((line, lineIndex) => ({ line, lineIndex, words: timeLineWords(line, keepUntimed) }))
    .filter((l) => l.words.some((w) => w.timed))
    .map(({ line, lineIndex, words }) => {
      const real = words.filter((w) => w.timed)
      return {
        lineIndex,
        id: line.id,
        words,
        start: Math.min(...real.map((w) => w.start)),
        end: Math.max(...real.map((w) => w.end)),
      }
    })
    .sort((a, b) => a.start - b.start || a.lineIndex - b.lineIndex)

  const appear = timed.map((l, i) => {
    const prevEnd = i > 0 ? (timed[i - 1]?.end ?? -Infinity) : -Infinity
    return Math.min(Math.max(l.start - o.leadInSec, prevEnd), l.start)
  })

  return timed.map((l, i) => {
    const a = appear[i] ?? l.start
    const nextAppear = appear[i + 1]
    const disappear =
      nextAppear !== undefined ? Math.min(l.end + o.holdSec, nextAppear) : l.end + o.holdSec
    let previewStart = a - o.previewLeadSec
    if (i > 0) {
      const prevDisappear = Math.min((timed[i - 1]?.end ?? 0) + o.holdSec, a)
      // Back-to-back lines: show this one as a preview for as long as the previous line is current.
      if (prevDisappear >= a) previewStart = Math.min(previewStart, appear[i - 1] ?? previewStart)
    }
    return { ...l, previewStart, appear: a, disappear: Math.max(disappear, a) }
  })
}

export interface LineState {
  /** 1 = preview, 0 = current, -1 = gone; fractional while animating. */
  slot: number
  /** Extra fade 0..1 for the preview appearing (multiplies slot-based opacity). */
  fade: number
}

/** Smoothstep easing. */
export function ease(x: number): number {
  const t = Math.min(Math.max(x, 0), 1)
  return t * t * (3 - 2 * t)
}

/** State of a line at time `t`, or null when it is not on screen. */
export function lineStateAt(l: LineTiming, t: number, transitionSec: number): LineState | null {
  const tr = Math.max(transitionSec, 1e-3)
  if (t < l.previewStart || t >= l.disappear + tr) return null
  const fade = ease((t - l.previewStart) / tr)
  if (t < l.appear) return { slot: 1, fade }
  if (t < l.disappear) return { slot: 1 - ease((t - l.appear) / tr), fade }
  // Leave from wherever the entry animation got to (a very short line may still be moving in).
  const from = 1 - ease((l.disappear - l.appear) / tr)
  return { slot: from - (from + 1) * ease((t - l.disappear) / tr), fade: 1 }
}

/** Karaoke progress of a word 0..1 at time `t`. */
export function wordProgress(w: { start: number; end: number }, t: number): number {
  if (t <= w.start) return 0
  if (t >= w.end) return 1
  return (t - w.start) / (w.end - w.start)
}
