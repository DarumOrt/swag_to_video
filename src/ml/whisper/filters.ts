/**
 * Cheap hallucination filters for Whisper output on music.
 * Whisper trained on subtitles tends to emit credit lines on non-speech and to loop on one phrase.
 */

/** Normalized substrings of typical subtitle-credit hallucinations (RU and EN). */
const HALLUCINATION_PHRASES = [
  'продолжение следует',
  'субтитры сделал',
  'субтитры создавал',
  'субтитры подогнал',
  'редактор субтитров',
  'корректор',
  'dimatorzok',
  'спасибо за просмотр',
  'подписывайтесь на канал',
  'ставьте лайки',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subtitles by',
  'amara.org',
]

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}.\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whole-segment texts that are hallucinations on their own (but fine inside a longer line). */
const HALLUCINATION_EXACT = ['субтитры', 'субтитры субтитры', 'продолжение', 'музыка', 'music']

export function isKnownHallucination(text: string): boolean {
  const norm = normalizeText(text)
  const bare = norm.replace(/\./g, '').trim()
  return (
    bare.length > 0 &&
    (HALLUCINATION_EXACT.includes(bare) || HALLUCINATION_PHRASES.some((p) => norm.includes(p)))
  )
}

/**
 * Length of the longest run of one n-gram (n = 1..4) repeated back to back, in repetitions.
 * Songs repeat words legitimately, so callers should use a generous threshold.
 */
export function maxRepeatRun(words: string[]): number {
  const norm = words.map(normalizeText)
  let best = norm.length > 0 ? 1 : 0
  for (let n = 1; n <= 4; n++) {
    for (let start = 0; start + 2 * n <= norm.length; start++) {
      let reps = 1
      while (start + (reps + 1) * n <= norm.length && sameGram(norm, start, start + reps * n, n))
        reps++
      best = Math.max(best, reps)
    }
  }
  return best
}

/**
 * Cuts back-to-back repeats of any 1..4-gram down to `maxReps` repetitions.
 * Returns the indices of the words to keep (in order).
 */
export function trimRepetitions(words: string[], maxReps: number): number[] {
  const norm = words.map(normalizeText)
  const keep: number[] = []
  let i = 0
  while (i < norm.length) {
    let cut = false
    for (let n = 1; n <= 4 && !cut; n++) {
      let reps = 1
      while (i + (reps + 1) * n <= norm.length && sameGram(norm, i, i + reps * n, n)) reps++
      if (reps > maxReps) {
        for (let k = 0; k < maxReps * n; k++) keep.push(i + k)
        i += reps * n
        cut = true
      }
    }
    if (!cut) keep.push(i++)
  }
  return keep
}

function sameGram(words: string[], a: number, b: number, n: number): boolean {
  for (let i = 0; i < n; i++) if (words[a + i] !== words[b + i]) return false
  return true
}
