/**
 * LRC and Enhanced LRC (A2 word tags) import/export.
 *
 * Line tags `[mm:ss.xx]` mark the line start (several tags = the line repeats).
 * Word tags `<mm:ss.xx>` mark word starts; a tag with no text after it marks the end of the previous word.
 * Imported tag times are human-made, so tagged words get `timingSource: 'manual'`;
 * words between tags are spread by syllables and marked 'interpolated'.
 */
import type { LyricLine, LyricWord, Lyrics, LyricsLanguage } from '@/shared'
import { buildLine, createLineIdFactory, flattenWords, withWords } from './model'
import { detectLanguage, parseSectionLabel, tokenizeLine } from './text'
import {
  DEFAULT_TIMING,
  type TimingOptions,
  distribute,
  sanitizeTimings,
  wordWeight,
} from './timing'

const TIME = String.raw`(\d+):(\d{1,2})(?:[.:](\d{1,3}))?`
const LINE_TAG = new RegExp(String.raw`^\[${TIME}\]`)
const WORD_TAG = new RegExp(`<${TIME}>`, 'g')
const META_TAG = /^\[([A-Za-z#]+)\s*:(.*)\]$/
const META_KEYS = new Set([
  'ar',
  'al',
  'ti',
  'au',
  'by',
  'offset',
  'length',
  're',
  'tool',
  've',
  '#',
])

function tagSeconds(min: string, sec: string, frac: string | undefined): number {
  return Number(min) * 60 + Number(sec) + (frac ? Number(`0.${frac}`) : 0)
}

/** Seconds → "mm:ss.xx". */
export function formatLrcTime(seconds: number): string {
  const cs = Math.round(Math.max(seconds, 0) * 100)
  const mm = Math.floor(cs / 6000)
  const ss = Math.floor(cs / 100) % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(mm)}:${pad(ss)}.${pad(cs % 100)}`
}

export interface LrcParseOptions extends Partial<TimingOptions> {
  language?: LyricsLanguage
}

export interface LrcParseResult {
  lyrics: Lyrics
  /** Header tags such as ar, ti, al, offset (raw values). */
  metadata: Record<string, string>
}

interface Entry {
  /** Line time before offset; null for lines without a tag. */
  time: number | null
  /** First line tag of the source line; word tags are shifted by (time - firstTime) for repeats. */
  firstTime: number | null
  content: string
  section: string | undefined
}

export function parseLrc(text: string, options: LrcParseOptions = {}): LrcParseResult {
  const timing = { ...DEFAULT_TIMING, ...options }
  const metadata: Record<string, string> = {}
  const entries: Entry[] = []
  let section: string | undefined

  for (const raw of text.split(/\r\n|\r|\n/)) {
    let rest = raw.trim()
    if (!rest) {
      section = undefined
      continue
    }
    const times: number[] = []
    for (let m = LINE_TAG.exec(rest); m; m = LINE_TAG.exec(rest)) {
      times.push(tagSeconds(m[1]!, m[2]!, m[3]))
      rest = rest.slice(m[0].length).trimStart()
    }
    if (!times.length) {
      const meta = META_TAG.exec(rest)
      if (meta && META_KEYS.has(meta[1]!.toLowerCase())) {
        metadata[meta[1]!.toLowerCase()] = meta[2]!.trim()
        continue
      }
      const label = parseSectionLabel(rest)
      if (label !== null) {
        section = label
        continue
      }
      entries.push({ time: null, firstTime: null, content: rest, section })
      continue
    }
    for (const time of times) entries.push({ time, firstTime: times[0]!, content: rest, section })
  }

  // LRC offset in ms: positive shows lyrics earlier.
  const offsetSec = Number(metadata.offset ?? 0) / 1000 || 0
  const shift = (t: number) => Math.max(t - offsetSec, 0)

  // Sort by time (repeated lines); untagged lines stay after the line they followed.
  let lastKey = -Infinity
  const ordered = entries
    .map((entry, order) => {
      if (entry.time !== null) lastKey = entry.time
      return { entry, key: lastKey, order }
    })
    .sort((a, b) => a.key - b.key || a.order - b.order)
    .map((x) => x.entry)

  const nextId = createLineIdFactory()
  const lines: LyricLine[] = []
  ordered.forEach((entry, i) => {
    const nextStart = ordered.slice(i + 1).find((e) => e.time !== null)?.time ?? null
    const words = buildLrcWords(entry, nextStart === null ? null : shift(nextStart), shift, timing)
    if (!words.length) return
    const line = buildLine(
      nextId(words.map((w) => w.text).join(' ')),
      words.map((w) => w.text),
      entry.section,
    )
    line.words = line.words.map((w, k) => ({ ...w, ...words[k]!, id: w.id }))
    lines.push(line)
  })

  const lyrics: Lyrics = { language: options.language ?? detectLanguage(text), lines }
  const sanitized = sanitizeTimings(
    flattenWords(lyrics).map((r) => r.word),
    timing.minWordSec,
  )
  return { lyrics: withWords(lyrics, sanitized), metadata }
}

interface Segment {
  time: number | null
  text: string
}

function splitSegments(content: string): Segment[] {
  const segments: Segment[] = []
  let time: number | null = null
  let last = 0
  for (const m of content.matchAll(WORD_TAG)) {
    segments.push({ time, text: content.slice(last, m.index) })
    time = tagSeconds(m[1]!, m[2]!, m[3])
    last = m.index + m[0].length
  }
  segments.push({ time, text: content.slice(last) })
  return segments
}

type LrcWord = Pick<LyricWord, 'text' | 'start' | 'end' | 'timingSource'>

function buildLrcWords(
  entry: Entry,
  nextLineStart: number | null,
  shift: (t: number) => number,
  timing: TimingOptions,
): LrcWord[] {
  const repeatDelta =
    entry.time !== null && entry.firstTime !== null ? entry.time - entry.firstTime : 0
  const segments = splitSegments(entry.content).map((s, i) => ({
    words: tokenizeLine(s.text),
    rawText: s.text.trim(),
    time:
      s.time !== null
        ? shift(s.time + repeatDelta)
        : i === 0 && entry.time !== null
          ? shift(entry.time)
          : null,
  }))

  const words: LrcWord[] = []
  segments.forEach((segment, i) => {
    if (!segment.words.length) {
      // Punctuation/emoji-only segment: keep it visible on the previous word.
      const prev = words[words.length - 1]
      if (segment.rawText && prev) prev.text += ` ${segment.rawText}`
      return
    }
    if (segment.time === null) {
      for (const text of segment.words)
        words.push({ text, start: null, end: null, timingSource: null })
      return
    }
    const weights = segment.words.map(wordWeight)
    const following = segments.slice(i + 1).find((s) => s.time !== null)?.time ?? null
    const capped = segment.time + weights.reduce((a, b) => a + b, 0) * timing.maxSecPerSyllable
    const end =
      following !== null
        ? following
        : nextLineStart !== null
          ? Math.min(nextLineStart, capped)
          : capped
    const slots = distribute(weights, new Array(weights.length + 1).fill(0), segment.time, end)
    slots.forEach((slot, k) =>
      words.push({
        text: segment.words[k]!,
        start: slot.start,
        end: slot.end,
        timingSource: k === 0 ? 'manual' : 'interpolated',
      }),
    )
  })
  return words
}

export interface LrcExportOptions {
  /** Word tags `<mm:ss.xx>` (Enhanced LRC). Default false. */
  enhanced?: boolean
  /** In enhanced mode, also write an end tag when a word ends before the next one starts. */
  wordEndTags?: boolean
  /** Write "[Label]" lines at section changes (not standard LRC, but most players ignore them). */
  includeSections?: boolean
  /** Header tags, e.g. { ar: 'Artist', ti: 'Title' }. */
  metadata?: Record<string, string>
}

export function toLrc(lyrics: Lyrics, options: LrcExportOptions = {}): string {
  const out: string[] = []
  for (const [key, value] of Object.entries(options.metadata ?? {})) out.push(`[${key}:${value}]`)
  let section: string | undefined
  lyrics.lines.forEach((line, i) => {
    if (options.includeSections && line.section !== section) {
      if (i > 0) out.push('')
      if (line.section !== undefined) out.push(`[${line.section}]`)
      section = line.section
    }
    const first = line.words[0]
    const prefix = first?.start != null ? `[${formatLrcTime(first.start)}]` : ''
    out.push(
      prefix +
        (options.enhanced ? enhancedText(line, options.wordEndTags ?? false) : plainText(line)),
    )
  })
  return out.join('\n') + '\n'
}

function plainText(line: LyricLine): string {
  return line.words.map((w) => w.text).join(' ')
}

function enhancedText(line: LyricLine, wordEndTags: boolean): string {
  const parts = line.words.map((word, i) => {
    let part = word.start !== null ? `<${formatLrcTime(word.start)}>${word.text}` : word.text
    const next = line.words[i + 1]
    if (
      wordEndTags &&
      next &&
      word.end !== null &&
      next.start !== null &&
      next.start - word.end > 0.005
    ) {
      part += ` <${formatLrcTime(word.end)}>`
    }
    return part
  })
  const last = line.words[line.words.length - 1]
  if (last?.end != null) parts.push(`<${formatLrcTime(last.end)}>`)
  return parts.join(' ')
}
