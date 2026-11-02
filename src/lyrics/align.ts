/**
 * Aligns the user's lyrics to recognized words (Whisper output).
 *
 * 1. Needleman–Wunsch over the two word sequences. Only fuzzy matches above `threshold`
 *    may pair up; the alignment is monotonic, so a repeated chorus can't borrow timings from
 *    another repetition. A small position prior breaks ties between identical repeats.
 * 2. Matched words become anchors ('aligned'). Words with user-made timings ('manual', 'tap')
 *    are kept as fixed anchors; recognized anchors that contradict them are dropped.
 * 3. Words between anchors are spread by syllables ('interpolated'); long gaps are treated as
 *    pauses: words stay next to the anchor of their own line. Edges are extrapolated.
 */
import type { LyricWord, Lyrics } from '@/shared'
import { flattenWords, withWords } from './model'
import { keySimilarity, wordKey } from './similarity'
import {
  DEFAULT_TIMING,
  type TimingOptions,
  distribute,
  sanitizeTimings,
  totalWeight,
  wordWeight,
} from './timing'

/** One recognized word, e.g. from Whisper with word timestamps. Times in seconds. */
export interface RecognizedWord {
  text: string
  start: number
  end: number
  /** 0..1 */
  confidence: number
}

export interface MatchOptions {
  /** Minimum similarity 0..100 for two words to pair up. */
  threshold: number
  /** Penalty for pairing words at different relative positions (0 = off). */
  positionWeight: number
  /**
   * Bonus for a match that directly continues the previous one. Keeps phrases together,
   * so a repeated chorus is matched as a whole instead of being stitched from several repeats.
   */
  runBonus: number
}

export const DEFAULT_MATCH: MatchOptions = { threshold: 55, positionWeight: 0.3, runBonus: 0.5 }

export interface WordMatch {
  lyricIndex: number
  recognizedIndex: number
  /** 0..100 */
  similarity: number
}

// Gap back-pointer bits: direction and the state of the cell we came from.
const GAP_UP = 1
const GAP_LEFT = 2
const FROM_MATCH = 4

/**
 * Monotonic fuzzy matching of two word lists: Needleman–Wunsch with two states
 * (ends in a match / ends in a gap) so consecutive matches can be rewarded. Returns pairs in order.
 */
export function matchWords(
  lyricWords: readonly string[],
  recognizedWords: readonly string[],
  options: Partial<MatchOptions> = {},
): WordMatch[] {
  const { threshold, positionWeight, runBonus } = { ...DEFAULT_MATCH, ...options }
  const a = lyricWords.map(wordKey)
  const b = recognizedWords.map(wordKey)
  const n = a.length
  const m = b.length
  if (!n || !m) return []

  const width = m + 1
  const size = (n + 1) * width
  const matchScore = new Float64Array(size).fill(-Infinity)
  const gapScore = new Float64Array(size)
  const matchFromMatch = new Uint8Array(size)
  const gapMove = new Uint8Array(size)
  for (let i = 1; i <= n; i++) gapMove[i * width] = GAP_UP
  for (let j = 1; j <= m; j++) gapMove[j] = GAP_LEFT

  const pairScore = (i: number, j: number, similarity: number) =>
    similarity / 100 - positionWeight * Math.abs((i - 0.5) / n - (j - 0.5) / m)

  for (let i = 1; i <= n; i++) {
    const ka = a[i - 1]!
    for (let j = 1; j <= m; j++) {
      const cell = i * width + j
      const up = cell - width
      const left = cell - 1
      const diag = up - 1

      let gap = gapScore[up]!
      let move = GAP_UP
      if (matchScore[up]! > gap) [gap, move] = [matchScore[up]!, GAP_UP | FROM_MATCH]
      if (gapScore[left]! > gap) [gap, move] = [gapScore[left]!, GAP_LEFT]
      if (matchScore[left]! > gap) [gap, move] = [matchScore[left]!, GAP_LEFT | FROM_MATCH]
      gapScore[cell] = gap
      gapMove[cell] = move

      const similarity = keySimilarity(ka, b[j - 1]!, threshold)
      if (similarity >= threshold) {
        const base = pairScore(i, j, similarity)
        const continued = matchScore[diag]! + base + runBonus
        const fresh = gapScore[diag]! + base
        matchScore[cell] = Math.max(continued, fresh)
        matchFromMatch[cell] = continued >= fresh ? 1 : 0
      }
    }
  }

  const matches: WordMatch[] = []
  let i = n
  let j = m
  let inMatch = matchScore[n * width + m]! >= gapScore[n * width + m]!
  while (i > 0 && j > 0) {
    const cell = i * width + j
    if (inMatch) {
      matches.push({
        lyricIndex: i - 1,
        recognizedIndex: j - 1,
        similarity: keySimilarity(a[i - 1]!, b[j - 1]!),
      })
      inMatch = matchFromMatch[cell] === 1
      i--
      j--
    } else {
      const move = gapMove[cell]!
      inMatch = (move & FROM_MATCH) !== 0
      if (move & GAP_UP) i--
      else j--
    }
  }
  return matches.reverse()
}

export interface AlignOptions extends MatchOptions, TimingOptions {
  /** Keep 'manual' and 'tap' timings as fixed anchors. Default true. */
  keepUserTimings: boolean
  /** Track length; trailing extrapolation won't run past it. */
  durationSec: number | null
}

export interface AlignResult {
  lyrics: Lyrics
  matches: WordMatch[]
  /** Words that got their timing from a recognized word. */
  anchoredCount: number
  wordCount: number
}

interface Anchor {
  index: number
  start: number
  end: number
  fixed: boolean
}

/**
 * Times every word of `lyrics` using recognized words. Returns new lyrics; input is not modified.
 * With no usable recognized words, lyrics are returned unchanged.
 */
export function alignLyrics(
  lyrics: Lyrics,
  recognized: readonly RecognizedWord[],
  options: Partial<AlignOptions> = {},
): AlignResult {
  const opts: AlignOptions = {
    ...DEFAULT_MATCH,
    ...DEFAULT_TIMING,
    keepUserTimings: true,
    durationSec: null,
    ...options,
  }
  const refs = flattenWords(lyrics)
  const words = refs.map((r) => ({ ...r.word }))
  const usable = recognized
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && wordKey(w.text).normalized)
    .toSorted((x, y) => x.start - y.start)

  const matches = matchWords(
    words.map((w) => w.text),
    usable.map((w) => w.text),
    opts,
  )
  const empty = { lyrics, matches, anchoredCount: 0, wordCount: words.length }
  if (!words.length) return empty

  const isFixed = (w: LyricWord) =>
    opts.keepUserTimings &&
    w.start !== null &&
    (w.timingSource === 'manual' || w.timingSource === 'tap')

  // Candidate anchors in reading order.
  const byIndex = new Map(matches.map((m) => [m.lyricIndex, m]))
  const candidates: Anchor[] = []
  words.forEach((word, index) => {
    if (isFixed(word)) {
      candidates.push({ index, start: word.start!, end: word.end ?? word.start!, fixed: true })
      return
    }
    const match = byIndex.get(index)
    if (!match) return
    const rec = usable[match.recognizedIndex]!
    candidates.push({ index, start: rec.start, end: rec.end, fixed: false })
  })

  // Drop recognized anchors that run against user-fixed ones.
  const anchors: Anchor[] = []
  for (const anchor of candidates) {
    if (anchor.fixed) {
      while (anchors.length && !anchors.at(-1)!.fixed && anchors.at(-1)!.start >= anchor.start) {
        anchors.pop()
      }
      anchors.push(anchor)
    } else if (!anchors.length || anchor.start > anchors.at(-1)!.start) {
      anchors.push(anchor)
    }
  }
  if (!anchors.length && !usable.length) return empty

  const timed: LyricWord[] = words.map((w) =>
    isFixed(w) ? w : { ...w, start: null, end: null, confidence: null, timingSource: null },
  )
  let anchoredCount = 0
  for (const anchor of anchors) {
    if (anchor.fixed) continue
    const match = byIndex.get(anchor.index)!
    const rec = usable[match.recognizedIndex]!
    timed[anchor.index] = {
      ...timed[anchor.index]!,
      start: anchor.start,
      end: anchor.end,
      confidence: clamp01(rec.confidence) * (match.similarity / 100),
      timingSource: 'aligned',
    }
    anchoredCount++
  }

  const lineOf = refs.map((r) => r.lineIndex)
  const fill = new GapFiller(timed, lineOf, opts)
  if (!anchors.length) {
    fill.run(0, words.length, usable[0]!.start, usable.at(-1)!.end, true)
  } else {
    fill.run(0, anchors[0]!.index, null, anchors[0]!.start)
    for (let k = 1; k < anchors.length; k++) {
      const prev = anchors[k - 1]!
      const next = anchors[k]!
      fill.run(prev.index + 1, next.index, prev.end, next.start)
    }
    const last = anchors.at(-1)!
    fill.run(last.index + 1, words.length, last.end, null)
  }

  return {
    lyrics: withWords(lyrics, sanitizeTimings(timed, opts.minWordSec)),
    matches,
    anchoredCount,
    wordCount: words.length,
  }
}

class GapFiller {
  private readonly words: LyricWord[]
  private readonly lineOf: readonly number[]
  private readonly opts: AlignOptions

  constructor(words: LyricWord[], lineOf: readonly number[], opts: AlignOptions) {
    this.words = words
    this.lineOf = lineOf
    this.opts = opts
  }

  /**
   * Times words [from, to). `after` = end of the previous anchor, `before` = start of the next one
   * (null at the edges). `stretch` forces spreading over the whole span.
   */
  run(
    from: number,
    to: number,
    after: number | null,
    before: number | null,
    stretch = false,
  ): void {
    if (from >= to) return
    const { secPerSyllable, maxSecPerSyllable, durationSec } = this.opts
    const weights = this.weights(from, to)
    const pauses = this.pauses(from, to, after !== null, before !== null)
    const total = totalWeight(weights, pauses)

    if (after !== null && before !== null) {
      if (stretch || before - after <= total * maxSecPerSyllable) {
        this.place(from, to, after, before)
        return
      }
      // Long gap = pause. Words of the previous anchor's line follow it, the rest lead into the next anchor.
      let split = from
      while (split < to && this.lineOf[split] === this.lineOf[from - 1]) split++
      if (split > from) this.pack(from, split, after, 'forward')
      if (split < to) this.pack(split, to, before, 'backward')
      return
    }
    if (before !== null) {
      this.place(from, to, Math.max(before - total * secPerSyllable, 0), before)
      return
    }
    if (after !== null) {
      let end = after + total * secPerSyllable
      if (durationSec !== null && end > durationSec) end = Math.max(durationSec, after)
      this.place(from, to, after, end)
    }
  }

  private pack(from: number, to: number, at: number, direction: 'forward' | 'backward'): void {
    const length =
      totalWeight(
        this.weights(from, to),
        this.pauses(from, to, direction === 'forward', direction === 'backward'),
      ) * this.opts.secPerSyllable
    if (direction === 'forward') this.place(from, to, at, at + length)
    else this.place(from, to, Math.max(at - length, 0), at)
  }

  private place(from: number, to: number, start: number, end: number): void {
    const slots = distribute(this.weights(from, to), this.pauses(from, to, true, true), start, end)
    slots.forEach((slot, k) => {
      const i = from + k
      this.words[i] = {
        ...this.words[i]!,
        start: slot.start,
        end: slot.end,
        confidence: null,
        timingSource: 'interpolated',
      }
    })
  }

  private weights(from: number, to: number): number[] {
    return this.words.slice(from, to).map((w) => wordWeight(w.text))
  }

  /** Pause weights: before each word in [from, to) and after the last, at line breaks. */
  private pauses(from: number, to: number, leading: boolean, trailing: boolean): number[] {
    const out: number[] = []
    for (let i = from; i <= to; i++) {
      const edge = (i === from && !leading) || (i === to && !trailing)
      const breakHere = i > 0 && i < this.lineOf.length && this.lineOf[i] !== this.lineOf[i - 1]
      out.push(!edge && breakHere ? this.opts.linePauseSyllables : 0)
    }
    return out
  }
}

function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(Math.max(x, 0), 1) : 0
}
