/**
 * Fuzzy word comparison: Levenshtein similarity 0..100, with RU↔EN transliteration
 * so "хей" matches "hey" and "бэйби" matches "baby" in mixed-language tracks.
 */
import { hasCyrillic, normalizeWord } from './text'

const RU_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
} // prettier-ignore

/** Cyrillic → Latin, other characters unchanged. Expects lowercase input. */
export function transliterate(text: string): string {
  let out = ''
  for (const ch of text) out += RU_TO_LATIN[ch] ?? ch
  return out
}

/**
 * Script-independent sound key: transliterates, then folds spellings that sound alike
 * in English vs Russian romanization (c/k, w/v, y/i, ph/f, doubled letters...).
 */
export function phoneticKey(normalized: string): string {
  return transliterate(normalized)
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c(?!h)/g, 'k')
    .replace(/qu/g, 'kv')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/j/g, 'dzh')
    .replace(/y/g, 'i')
    .replace(/(.)\1+/g, '$1')
}

let row: Uint16Array = new Uint16Array(64)

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  if (row.length <= b.length) row = new Uint16Array(b.length * 2 + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]!
    row[0] = i
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]!
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      row[j] = Math.min(above + 1, row[j - 1]! + 1, diagonal + cost)
      diagonal = above
    }
  }
  return row[b.length]!
}

/** Precomputed comparison forms of a word. */
export interface WordKey {
  normalized: string
  phonetic: string
  cyrillic: boolean
}

export function wordKey(text: string): WordKey {
  const normalized = normalizeWord(text)
  return { normalized, phonetic: phoneticKey(normalized), cyrillic: hasCyrillic(normalized) }
}

/**
 * Similarity 0..100 of two prepared keys. Same script → plain Levenshtein,
 * different scripts → Levenshtein of phonetic keys.
 * Pairs that cannot reach `minScore` (by length alone) return 0 without computing the distance.
 */
export function keySimilarity(a: WordKey, b: WordKey, minScore = 0): number {
  if (!a.normalized || !b.normalized) return 0
  if (a.normalized === b.normalized) return 100
  const x = a.cyrillic === b.cyrillic ? a.normalized : a.phonetic
  const y = a.cyrillic === b.cyrillic ? b.normalized : b.phonetic
  if (x === y) return 100
  const longest = Math.max(x.length, y.length)
  if ((100 * Math.min(x.length, y.length)) / longest < minScore) return 0
  return 100 * (1 - levenshtein(x, y) / longest)
}

/** Similarity 0..100 of two display words. */
export function wordSimilarity(a: string, b: string): number {
  return keySimilarity(wordKey(a), wordKey(b))
}
