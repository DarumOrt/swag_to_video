/**
 * Lyrics model helpers: stable ids, building lines, plain-text parse/export, word traversal.
 */
import type { LyricLine, LyricWord, Lyrics, LyricsLanguage } from '@/shared'
import { detectLanguage, normalizeLine, parseSectionLabel, tokenizeLine } from './text'

/** FNV-1a 32-bit, base36. */
export function hashString(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/**
 * Line ids derived from the line's normalized text plus its occurrence number,
 * so re-parsing edited lyrics keeps ids (and accents bound to words) of unchanged lines.
 * Repeated chorus lines get "-2", "-3"... suffixes.
 */
export function createLineIdFactory(): (lineText: string) => string {
  const seen = new Map<string, number>()
  return (lineText) => {
    const base = `l${hashString(normalizeLine(lineText))}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  }
}

export function wordId(lineId: string, index: number): string {
  return `${lineId}:${index}`
}

export function untimedWord(id: string, text: string): LyricWord {
  return { id, text, start: null, end: null, confidence: null, timingSource: null }
}

/** Builds an untimed line from display words. */
export function buildLine(
  id: string,
  words: string[],
  section?: string,
  stanzaStart = false,
): LyricLine {
  const line: LyricLine = { id, words: words.map((text, i) => untimedWord(wordId(id, i), text)) }
  if (section !== undefined) line.section = section
  if (stanzaStart) line.stanzaStart = true
  return line
}

export interface ParseTextOptions {
  /** Overrides language detection. */
  language?: LyricsLanguage
}

/**
 * Plain lyrics → untimed `Lyrics`.
 * A section header ("[Припев]", "Куплет 2:") labels the following lines up to the next blank line.
 * The first line, and the first line after a blank line or a header, gets `stanzaStart`.
 * Lines without singable content are dropped.
 */
export function parseLyricsText(text: string, options: ParseTextOptions = {}): Lyrics {
  const nextId = createLineIdFactory()
  const lines: LyricLine[] = []
  let section: string | undefined
  let stanzaStart = true
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const trimmed = raw.trim()
    if (!trimmed) {
      section = undefined
      stanzaStart = true
      continue
    }
    const label = parseSectionLabel(trimmed)
    if (label !== null) {
      section = label
      stanzaStart = true
      continue
    }
    const words = tokenizeLine(trimmed)
    if (!words.length) continue
    lines.push(buildLine(nextId(words.join(' ')), words, section, stanzaStart))
    stanzaStart = false
  }
  return { language: options.language ?? detectLanguage(text), lines }
}

/**
 * Source lines to write before `line` when exporting: a blank line at a stanza or section change,
 * then "[Label]" if the section changed to a labeled one.
 */
export function stanzaHeader(
  line: LyricLine,
  index: number,
  prevSection: string | undefined,
): string[] {
  const sectionChanged = line.section !== prevSection
  const out: string[] = []
  if (index > 0 && (line.stanzaStart || sectionChanged)) out.push('')
  if (line.section !== undefined && (sectionChanged || line.stanzaStart))
    out.push(`[${line.section}]`)
  return out
}

/** `Lyrics` → plain text; stanzas are separated by blank lines, sections get "[Label]". */
export function lyricsToText(lyrics: Lyrics): string {
  const out: string[] = []
  lyrics.lines.forEach((line, i) => {
    out.push(...stanzaHeader(line, i, lyrics.lines[i - 1]?.section))
    out.push(line.words.map((w) => w.text).join(' '))
  })
  return out.join('\n')
}

export interface WordRef {
  word: LyricWord
  lineIndex: number
  wordIndex: number
}

/** All words in reading order. */
export function flattenWords(lyrics: Lyrics): WordRef[] {
  return lyrics.lines.flatMap((line, lineIndex) =>
    line.words.map((word, wordIndex) => ({ word, lineIndex, wordIndex })),
  )
}

/** Returns new lyrics with the words replaced in reading order (same count, same structure). */
export function withWords(lyrics: Lyrics, words: readonly LyricWord[]): Lyrics {
  let k = 0
  return {
    ...lyrics,
    lines: lyrics.lines.map((line) => ({ ...line, words: line.words.map(() => words[k++]!) })),
  }
}

export function isTimed(word: LyricWord): word is LyricWord & { start: number; end: number } {
  return word.start !== null && word.end !== null
}
