/**
 * Text primitives: tokenization, normalization for comparison, syllable estimate, language detection.
 */
import type { LyricsLanguage } from '@/shared'

const WORD_CHAR = /[\p{L}\p{N}]/u
const NOT_WORD_CHARS = /[^\p{L}\p{N}]+/gu
const COMBINING_MARKS = /\p{M}+/gu

/** True when a whitespace-separated token contains something that can be sung (a letter or digit). */
export function isWordToken(token: string): boolean {
  return WORD_CHAR.test(token)
}

/**
 * Splits a lyric line into display words.
 * Words keep their punctuation ("Эй,", "don't", "по-моему", "(yeah)").
 * Tokens without letters or digits (dashes, "...", emoji) are glued to the previous word,
 * or to the next one at the start of a line, so they stay visible but never get their own timing.
 * Returns [] for lines with nothing singable.
 */
export function tokenizeLine(line: string): string[] {
  const words: string[] = []
  let leading = ''
  for (const part of line.trim().split(/\s+/)) {
    if (!part) continue
    if (isWordToken(part)) {
      words.push(leading ? `${leading} ${part}` : part)
      leading = ''
    } else if (words.length > 0) {
      words[words.length - 1] += ` ${part}`
    } else {
      leading = leading ? `${leading} ${part}` : part
    }
  }
  return words
}

/**
 * Comparison form of a word: lowercase, ё→е, stress marks removed,
 * apostrophes, hyphens and all other punctuation dropped ("Don't" → "dont", "По-моему!" → "помоему").
 */
export function normalizeWord(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(COMBINING_MARKS, '')
    .replace(NOT_WORD_CHARS, '')
}

/** Normalized words of a line joined by single spaces. */
export function normalizeLine(text: string): string {
  return tokenizeLine(text).map(normalizeWord).filter(Boolean).join(' ')
}

export function hasCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text)
}

/** 'ru' / 'en' when ≥85% of letters are Cyrillic / Latin, otherwise 'mixed'. Empty text → 'en'. */
export function detectLanguage(text: string): LyricsLanguage {
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu)?.length ?? 0
  const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0
  const total = cyrillic + latin
  if (total === 0) return 'en'
  if (cyrillic / total >= 0.85) return 'ru'
  if (latin / total >= 0.85) return 'en'
  return 'mixed'
}

/**
 * Rough syllable count, good enough to weight word durations.
 * Russian: vowel letters. English: vowel groups minus a silent final e. Digits: ~1.5 per digit.
 * Returns 0 for words without vowels ("в", "к").
 */
export function countSyllables(text: string): number {
  const word = normalizeWord(text)
  if (!word) return 0
  const russian = word.match(/[аеиоуыэюя]/g)?.length ?? 0
  const latin = word.replace(/[^a-z]/g, '')
  const digits = word.replace(/[^0-9]/g, '').length
  return russian + (latin ? englishSyllables(latin) : 0) + Math.ceil(digits * 1.5)
}

function englishSyllables(word: string): number {
  if (word.length <= 3) return 1
  const stripped = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(stripped.match(/[aeiouy]{1,2}/g)?.length ?? 0, 1)
}

const SECTION_KEYWORD =
  /^(?:припев|пре-?припев|куплет|бридж|интро|аутро|проигрыш|хук|кода|chorus|pre-?chorus|verse|bridge|intro|outro|hook|refrain|interlude|break|coda)(?=$|[\s\d.,:x×-])/i

/**
 * Recognizes a section header line: "[Припев]", "[Verse 2: Artist]", "Куплет 1:", "(Chorus x2)".
 * Bare words without brackets or a trailing colon are treated as lyrics.
 */
export function parseSectionLabel(line: string): string | null {
  const trimmed = line.trim()
  const bracket = /^\[(.+)\]$/.exec(trimmed)
  if (bracket) return bracket[1]!.trim() || null
  const inner = trimmed
    .replace(/^\((.*)\)$/, '$1')
    .replace(/:$/, '')
    .trim()
  if (inner !== trimmed && inner.length <= 40 && SECTION_KEYWORD.test(inner)) return inner
  return null
}
