/** Word error rate of a transcript excerpt against the best-matching span of a full reference text. */

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}'\s]+/gu, ' ')
    .replace(/'/g, '')
    .split(/\s+/)
    .filter(Boolean)
}

export interface WerResult {
  wer: number
  errors: number
  /** Length of the reference span the hypothesis was aligned to. */
  refWords: number
}

/**
 * Semi-global alignment: the hypothesis must be matched completely, the reference may start and end
 * anywhere (we transcribe a clip, the reference is the whole song). WER = edits / matched span length.
 */
export function werAgainstSpan(hypothesis: string, reference: string): WerResult | null {
  const hyp = normalizeWords(hypothesis)
  const ref = normalizeWords(reference)
  if (!hyp.length || !ref.length) return null

  // dp[i][j]: min edits aligning hyp[0..i) with a ref span ending at j; start[i][j]: where that span starts.
  let prevCost = new Array<number>(ref.length + 1).fill(0)
  let prevStart = Array.from({ length: ref.length + 1 }, (_, j) => j)
  for (let i = 1; i <= hyp.length; i++) {
    const cost = new Array<number>(ref.length + 1)
    const start = new Array<number>(ref.length + 1)
    cost[0] = i
    start[0] = 0
    for (let j = 1; j <= ref.length; j++) {
      const sub = prevCost[j - 1]! + (hyp[i - 1] === ref[j - 1] ? 0 : 1)
      const del = cost[j - 1]! + 1 // reference word missing in hypothesis
      const ins = prevCost[j]! + 1 // extra hypothesis word
      if (sub <= del && sub <= ins) {
        cost[j] = sub
        start[j] = prevStart[j - 1]!
      } else if (del <= ins) {
        cost[j] = del
        start[j] = start[j - 1]!
      } else {
        cost[j] = ins
        start[j] = prevStart[j]!
      }
    }
    prevCost = cost
    prevStart = start
  }

  let bestJ = 0
  for (let j = 1; j <= ref.length; j++) if (prevCost[j]! < prevCost[bestJ]!) bestJ = j
  const refWords = Math.max(bestJ - prevStart[bestJ]!, 1)
  const errors = prevCost[bestJ]!
  return { wer: errors / refWords, errors, refWords }
}
