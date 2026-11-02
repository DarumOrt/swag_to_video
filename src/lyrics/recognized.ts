/**
 * No-lyrics mode: builds `Lyrics` straight from recognized words, split into lines by pauses.
 */
import type { LyricLine, LyricWord, Lyrics, LyricsLanguage } from '@/shared'
import type { RecognizedWord } from './align'
import { buildLine, createLineIdFactory, withWords } from './model'
import { detectLanguage, isWordToken } from './text'
import { DEFAULT_TIMING, sanitizeTimings } from './timing'

export interface RecognizedLinesOptions {
  /** A silence at least this long starts a new line. */
  lineGapSec: number
  maxWordsPerLine: number
  /** Below this confidence a word counts as uncertain (see `isUncertain`). */
  uncertainBelow: number
  language?: LyricsLanguage
}

export const DEFAULT_RECOGNIZED_LINES: RecognizedLinesOptions = {
  lineGapSec: 0.8,
  maxWordsPerLine: 8,
  uncertainBelow: 0.5,
}

/** True for words whose timing/text the editor should highlight for checking. */
export function isUncertain(
  word: LyricWord,
  threshold = DEFAULT_RECOGNIZED_LINES.uncertainBelow,
): boolean {
  return word.confidence !== null && word.confidence < threshold
}

/**
 * Recognized words → lyrics with `timingSource: 'whisper'` and the recognizer's confidence.
 * Lines break at pauses, after sentence-ending punctuation, or at `maxWordsPerLine`.
 */
export function lyricsFromRecognized(
  recognized: readonly RecognizedWord[],
  options: Partial<RecognizedLinesOptions> = {},
): Lyrics {
  const opts = { ...DEFAULT_RECOGNIZED_LINES, ...options }
  const words = recognized
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => isWordToken(w.text) && Number.isFinite(w.start) && Number.isFinite(w.end))
    .toSorted((a, b) => a.start - b.start)

  const groups: (typeof words)[] = []
  let current: typeof words = []
  for (const word of words) {
    const prev = current.at(-1)
    const breakHere =
      prev !== undefined &&
      (word.start - prev.end >= opts.lineGapSec ||
        /[.!?…]["»”)]*$/.test(prev.text) ||
        current.length >= opts.maxWordsPerLine)
    if (breakHere) {
      groups.push(current)
      current = []
    }
    current.push(word)
  }
  if (current.length) groups.push(current)

  const nextId = createLineIdFactory()
  const lines: LyricLine[] = groups.map((group) => {
    const line = buildLine(
      nextId(group.map((w) => w.text).join(' ')),
      group.map((w) => w.text),
    )
    const timed = line.words.map((w, i) => ({
      ...w,
      start: group[i]!.start,
      end: group[i]!.end,
      confidence: Math.min(Math.max(group[i]!.confidence, 0), 1),
      timingSource: 'whisper' as const,
    }))
    return { ...line, words: timed }
  })
  const lyrics: Lyrics = {
    language: opts.language ?? detectLanguage(words.map((w) => w.text).join(' ')),
    lines,
  }
  return withWords(
    lyrics,
    sanitizeTimings(
      lines.flatMap((l) => l.words),
      DEFAULT_TIMING.minWordSec,
    ),
  )
}
