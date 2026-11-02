/**
 * Pure edits of `Lyrics` made by the editor. Every function returns new lyrics.
 */
import { flattenWords } from '@/lyrics'
import type { LyricWord, Lyrics, TimingSource } from '@/shared'

export interface WordPatch {
  text?: string
  start?: number | null
  end?: number | null
}

/** Applies a user edit to one word; the word's timing becomes 'manual'. */
export function editWord(lyrics: Lyrics, wordId: string, patch: WordPatch): Lyrics {
  return mapWords(lyrics, (word) => {
    if (word.id !== wordId) return word
    const next: LyricWord = { ...word, ...patch, confidence: null, timingSource: 'manual' }
    if (next.start === null) return { ...next, end: null, timingSource: null }
    return next
  })
}

/** Removes a word; a line left without words is removed too. */
export function deleteWord(lyrics: Lyrics, wordId: string): Lyrics {
  return {
    ...lyrics,
    lines: lyrics.lines
      .map((line) => ({ ...line, words: line.words.filter((word) => word.id !== wordId) }))
      .filter((line) => line.words.length > 0),
  }
}

const USER_SOURCES: readonly TimingSource[] = ['manual', 'tap']

/**
 * Re-applies user-made timings from `previous` to words of `next` with the same id and text.
 * Line ids are derived from line text, so unchanged lines keep their word ids after a re-paste.
 */
export function carryUserTimings(previous: Lyrics | null, next: Lyrics): Lyrics {
  if (!previous) return next
  const kept = new Map(
    flattenWords(previous)
      .map((ref) => ref.word)
      .filter((word) => word.timingSource && USER_SOURCES.includes(word.timingSource))
      .map((word) => [word.id, word]),
  )
  if (!kept.size) return next
  return mapWords(next, (word) => {
    const old = kept.get(word.id)
    return old && old.text === word.text ? { ...old } : word
  })
}

export interface TimedWordIndex {
  ids: string[]
  starts: Float64Array
  ends: Float64Array
}

/** Timed words in reading order, for fast "which word is under the playhead" lookups. */
export function indexTimedWords(lyrics: Lyrics | null): TimedWordIndex {
  const timed = lyrics
    ? flattenWords(lyrics)
        .map((ref) => ref.word)
        .filter((word) => word.start !== null && word.end !== null)
    : []
  return {
    ids: timed.map((word) => word.id),
    starts: Float64Array.from(timed, (word) => word.start!),
    ends: Float64Array.from(timed, (word) => word.end!),
  }
}

/** Id of the word sounding at `time`, or null between words. */
export function wordAt(index: TimedWordIndex, time: number): string | null {
  let lo = 0
  let hi = index.starts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (index.starts[mid]! <= time) lo = mid + 1
    else hi = mid
  }
  const k = lo - 1
  return k >= 0 && time < index.ends[k]! ? index.ids[k]! : null
}

export function countWords(lyrics: Lyrics | null): { total: number; timed: number } {
  const words = lyrics ? flattenWords(lyrics).map((ref) => ref.word) : []
  return { total: words.length, timed: words.filter((word) => word.start !== null).length }
}

function mapWords(lyrics: Lyrics, fn: (word: LyricWord) => LyricWord): Lyrics {
  return {
    ...lyrics,
    lines: lyrics.lines.map((line) => ({ ...line, words: line.words.map(fn) })),
  }
}
