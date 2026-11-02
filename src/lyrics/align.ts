/**
 * Aligns the user's lyrics to recognized words (Whisper output).
 *
 * 1. Both sides are split into match units: hyphenated words into parts ("по-моему" → по, моему)
 *    and numbers 0–999 into spelled words ("21" → двадцать, один), so "2" ↔ "два" and
 *    "по-моему" ↔ "по моему" can pair up.
 * 2. Needleman–Wunsch over the units. Only fuzzy matches above `threshold` may pair; the
 *    alignment is monotonic; consecutive matches get a bonus unless the recognized stream pauses
 *    between them; a time-based position prior decides which repetition of a chorus a lone
 *    recognized chorus belongs to.
 * 3. Matched words become anchors ('aligned'). Words whose source is in `fixedSources`
 *    ('manual', 'tap', 'imported' by default) are kept as fixed anchors; recognized anchors that
 *    contradict them are dropped.
 * 4. Words between anchors are spread by syllables ('interpolated'); long gaps are treated as
 *    pauses: words stay next to the anchor of their own line. Edges are extrapolated.
 */
import type { LyricWord, Lyrics, TimingSource } from '@/shared'
import { flattenWords, withWords } from './model'
import { type NumberLanguage, spellNumber } from './numbers'
import { keySimilarity, wordKey } from './similarity'
import { hasCyrillic, normalizeWord } from './text'
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

export interface TimedText {
  text: string
  start: number
  end: number
}

export interface MatchOptions {
  /** Minimum similarity 0..100 for two words to pair up. */
  threshold: number
  /**
   * Penalty for pairing words at different relative positions (0 = off). With timed recognized
   * words the position is by time, otherwise by index.
   */
  positionWeight: number
  /**
   * Bonus for a match that directly continues the previous one. Keeps phrases together,
   * so a repeated chorus is matched as a whole instead of being stitched from several repeats.
   */
  runBonus: number
  /** A recognized pause longer than this breaks a run: no run bonus across it. */
  pauseSec: number
  /** Track length, for the time-based position prior; null = end of the last recognized word. */
  durationSec: number | null
}

export const DEFAULT_MATCH: MatchOptions = {
  threshold: 55,
  positionWeight: 0.3,
  runBonus: 0.5,
  pauseSec: 1.5,
  durationSec: null,
}

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
 * Pass recognized words with times to enable the time prior and pause-aware run bonus.
 */
export function matchWords(
  lyricWords: readonly string[],
  recognizedWords: readonly (string | TimedText)[],
  options: Partial<MatchOptions> = {},
): WordMatch[] {
  const { threshold, positionWeight, runBonus, pauseSec, durationSec } = {
    ...DEFAULT_MATCH,
    ...options,
  }
  const a = lyricWords.map(wordKey)
  const b = recognizedWords.map((w) => wordKey(typeof w === 'string' ? w : w.text))
  const n = a.length
  const m = b.length
  if (!n || !m) return []

  // Relative position of each recognized word and whether a pause precedes it.
  const timed = recognizedWords.every((w) => typeof w !== 'string')
  const recPosition = new Float64Array(m)
  const pauseBefore = new Uint8Array(m)
  if (timed) {
    const words = recognizedWords as readonly TimedText[]
    const t0 = words[0]!.start
    const span = Math.max((durationSec ?? words.at(-1)!.end) - t0, 1e-6)
    words.forEach((w, j) => {
      recPosition[j] = Math.min(Math.max((w.start - t0) / span, 0), 1)
      if (j > 0 && w.start - words[j - 1]!.end > pauseSec) pauseBefore[j] = 1
    })
  } else {
    for (let j = 0; j < m; j++) recPosition[j] = (j + 0.5) / m
  }

  const width = m + 1
  const size = (n + 1) * width
  const matchScore = new Float64Array(size).fill(-Infinity)
  const gapScore = new Float64Array(size)
  const matchFromMatch = new Uint8Array(size)
  const gapMove = new Uint8Array(size)
  for (let i = 1; i <= n; i++) gapMove[i * width] = GAP_UP
  for (let j = 1; j <= m; j++) gapMove[j] = GAP_LEFT

  for (let i = 1; i <= n; i++) {
    const ka = a[i - 1]!
    const lyricPosition = (i - 0.5) / n
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
        const base =
          similarity / 100 - positionWeight * Math.abs(lyricPosition - recPosition[j - 1]!)
        const bonus = pauseBefore[j - 1] ? 0 : runBonus
        const continued = matchScore[diag]! + base + bonus
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

const INNER_HYPHEN = /(?<=[\p{L}\p{N}])[-‐‑](?=[\p{L}\p{N}])/u

/**
 * Match units of one display word: hyphen parts, numbers 0–999 spelled out.
 * "по-моему" → ["по", "моему"], "21" → ["двадцать", "один"] (ru).
 */
export function matchUnits(text: string, language: NumberLanguage): string[] {
  return text.split(INNER_HYPHEN).flatMap((part) => {
    const normalized = normalizeWord(part)
    if (!normalized) return []
    if (/^\d+$/.test(normalized)) {
      const spelled = spellNumber(Number(normalized), language)
      if (spelled) return spelled
    }
    return [part]
  })
}

/** Number language for word i: from the lyrics language, or nearby script for mixed lyrics. */
function numberLanguage(texts: readonly string[], i: number, language: Lyrics['language']) {
  if (language !== 'mixed') return language
  for (let d = 1; d <= 3; d++) {
    for (const k of [i - d, i + d]) {
      const text = texts[k]
      if (text && normalizeWord(text).replace(/\d/g, '')) return hasCyrillic(text) ? 'ru' : 'en'
    }
  }
  return 'ru'
}

interface Unit extends TimedText {
  owner: number
}

function lyricUnits(texts: readonly string[], language: Lyrics['language']): Unit[] {
  return texts.flatMap((text, owner) =>
    matchUnits(text, numberLanguage(texts, owner, language)).map((unit) => ({
      owner,
      text: unit,
      start: 0,
      end: 0,
    })),
  )
}

/** Recognized words split into units; a word's time is shared by its units by text length. */
function recognizedUnits(words: readonly RecognizedWord[], language: Lyrics['language']): Unit[] {
  const texts = words.map((w) => w.text)
  return words.flatMap((word, owner) => {
    const parts = matchUnits(word.text, numberLanguage(texts, owner, language))
    const lengths = parts.map((p) => Math.max(normalizeWord(p).length, 1))
    const total = lengths.reduce((x, y) => x + y, 0)
    let t = word.start
    return parts.map((text, k) => {
      const start = t
      t += ((word.end - word.start) * lengths[k]!) / total
      return { owner, text, start, end: t }
    })
  })
}

export interface AlignOptions extends MatchOptions, TimingOptions {
  /** Sources kept as fixed anchors. Default: 'manual', 'tap', 'imported'. */
  fixedSources: readonly TimingSource[]
  /** @deprecated Use `fixedSources`. `false` = no fixed anchors; `true` = the default sources. */
  keepUserTimings?: boolean
}

export const DEFAULT_FIXED_SOURCES: readonly TimingSource[] = ['manual', 'tap', 'imported']

export interface AlignResult {
  lyrics: Lyrics
  /** Word-level pairs (indices into the lyrics' reading order and the recognized list). */
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

interface RecognizedAnchor {
  start: number
  end: number
  /** Mean unit similarity 0..100. */
  similarity: number
  confidence: number
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
    fixedSources: options.keepUserTimings === false ? [] : DEFAULT_FIXED_SOURCES,
    ...options,
  }
  const refs = flattenWords(lyrics)
  const words = refs.map((r) => ({ ...r.word }))
  const usable = recognized
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && wordKey(w.text).normalized)
    .toSorted((x, y) => x.start - y.start)

  const texts = words.map((w) => w.text)
  const lUnits = lyricUnits(texts, lyrics.language)
  const rUnits = recognizedUnits(usable, lyrics.language)
  const unitMatches = matchWords(
    lUnits.map((u) => u.text),
    rUnits,
    opts,
  )

  // Unit matches → one recognized anchor per lyric word, plus word-level match list.
  const recAnchors = new Map<number, RecognizedAnchor & { count: number }>()
  const wordMatches = new Map<string, WordMatch>()
  for (const um of unitMatches) {
    const owner = lUnits[um.lyricIndex]!.owner
    const unit = rUnits[um.recognizedIndex]!
    const conf = clamp01(usable[unit.owner]!.confidence)
    const prev = recAnchors.get(owner)
    if (!prev) {
      recAnchors.set(owner, { ...unit, similarity: um.similarity, confidence: conf, count: 1 })
    } else {
      prev.end = Math.max(prev.end, unit.end)
      prev.similarity += um.similarity
      prev.confidence += conf
      prev.count++
    }
    const key = `${owner}:${unit.owner}`
    const known = wordMatches.get(key)
    if (!known || known.similarity < um.similarity) {
      wordMatches.set(key, {
        lyricIndex: owner,
        recognizedIndex: unit.owner,
        similarity: um.similarity,
      })
    }
  }
  for (const anchor of recAnchors.values()) {
    anchor.similarity /= anchor.count
    anchor.confidence /= anchor.count
  }
  const matches = [...wordMatches.values()]

  const empty = { lyrics, matches, anchoredCount: 0, wordCount: words.length }
  if (!words.length) return empty

  const isFixed = (w: LyricWord) =>
    w.start !== null && w.timingSource !== null && opts.fixedSources.includes(w.timingSource)

  // Candidate anchors in reading order.
  const candidates: Anchor[] = []
  words.forEach((word, index) => {
    if (isFixed(word)) {
      candidates.push({ index, start: word.start!, end: word.end ?? word.start!, fixed: true })
      return
    }
    const rec = recAnchors.get(index)
    if (rec) candidates.push({ index, start: rec.start, end: rec.end, fixed: false })
  })

  // Drop recognized anchors that run against fixed ones.
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
    const rec = recAnchors.get(anchor.index)!
    timed[anchor.index] = {
      ...timed[anchor.index]!,
      start: anchor.start,
      end: anchor.end,
      confidence: rec.confidence * (rec.similarity / 100),
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
