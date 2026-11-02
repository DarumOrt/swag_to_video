/**
 * Pure helpers that turn one Whisper generation pass (≤ 30 s window) into segments, words and the
 * next seek position. No transformers.js imports — unit-tested in segments.test.ts.
 */

/** Seconds per Whisper timestamp token and per encoder position. */
export const TIME_PRECISION = 0.02

export interface WindowTokens {
  /** Generated token ids after the decoder prompt (may end with EOT). */
  tokens: number[]
  eotId: number
  /** Id of `<|0.00|>`; ids ≥ this are timestamp tokens. */
  timestampBegin: number
  /** Window length in seconds (≤ 30). */
  windowSec: number
}

export interface WindowSegment {
  /** Seconds from the window start. */
  start: number
  end: number
  /** Indices into `tokens` of the text tokens in this segment. */
  tokenIndices: number[]
}

export interface DecodedWindow {
  segments: WindowSegment[]
  /** How far to move the window start, seconds. Always > 0. */
  advanceSec: number
  /** True when the model ran out of tokens without closing the window (likely a repetition loop). */
  truncated: boolean
}

/** Minimum seek step, so a degenerate output can never stall the loop. */
const MIN_ADVANCE_SEC = 1

/**
 * Splits a window's tokens into timestamped segments and decides where the next window starts.
 * Mirrors the seek rules of `WhisperForConditionalGeneration.generate()` (Python and transformers.js):
 * if the output ends inside an unfinished segment, that segment is dropped and the next window starts
 * at its beginning, so words are never cut by a window edge.
 */
export function decodeWindow({
  tokens,
  eotId,
  timestampBegin,
  windowSec,
}: WindowTokens): DecodedWindow {
  const eot = tokens.indexOf(eotId)
  const generated = eot === -1 ? tokens : tokens.slice(0, eot)
  const truncated = eot === -1
  const isTs = generated.map((t) => t >= timestampBegin)
  const time = (t: number) => (t - timestampBegin) * TIME_PRECISION

  // Index (exclusive) of the last consecutive timestamp pair: <|t_end|><|t_next_start|>.
  let lastPairEnd = -1
  for (let i = 0; i + 1 < generated.length; i++) {
    if (isTs[i] && isTs[i + 1]) lastPairEnd = i + 1
  }
  const n = generated.length
  const singleTimestampEnding = n >= 2 && isTs[n - 1] === true && isTs[n - 2] === false

  let keep = n
  let advanceSec = windowSec
  if (lastPairEnd !== -1 && (!singleTimestampEnding || truncated)) {
    // Ends mid-segment (or ran out of tokens): keep everything up to the last closed segment.
    keep = lastPairEnd
    advanceSec = time(generated[lastPairEnd - 1]!)
  }
  advanceSec = Math.min(Math.max(advanceSec, MIN_ADVANCE_SEC), windowSec)

  const segments: WindowSegment[] = []
  let start: number | null = null
  let text: number[] = []
  for (let i = 0; i < keep; i++) {
    const t = generated[i]!
    if (!isTs[i]) {
      text.push(i)
      continue
    }
    if (text.length > 0) {
      segments.push({ start: start ?? 0, end: time(t), tokenIndices: text })
      text = []
      start = null
    } else {
      start = time(t)
    }
  }
  if (text.length > 0) {
    // Text without a closing timestamp (window fully consumed): close it at the window end.
    segments.push({ start: start ?? 0, end: windowSec, tokenIndices: text })
  }

  return { segments, advanceSec, truncated }
}

export interface WordTiming {
  text: string
  start: number
  end: number
  /** Mean token probability 0..1, null if unknown. */
  confidence: number | null
}

/**
 * Builds words from token groups (as produced by the tokenizer's word splitter).
 * `tokenTimes[i]` is the DTW start time of token i (window-relative); a word ends where the token
 * after its last token starts. `offsetSec` converts window-relative times to track times.
 */
export function buildWords(
  groups: { text: string; indices: number[] }[],
  tokenTimes: ArrayLike<number>,
  tokenProbs: ArrayLike<number>,
  offsetSec: number,
  segmentEnd: number,
): WordTiming[] {
  const words: WordTiming[] = []
  for (const { text, indices } of groups) {
    const first = indices[0]
    const last = indices[indices.length - 1]
    if (first === undefined || last === undefined) continue
    const trimmed = text.trim()
    if (!trimmed) continue

    const start = tokenTimes[first] ?? 0
    const next = tokenTimes[last + 1]
    let end = next !== undefined && next > start ? next : Math.max(start, segmentEnd)
    end = Math.min(end, Math.max(segmentEnd, start))

    let sum = 0
    let count = 0
    for (const i of indices) {
      const p = tokenProbs[i]
      if (p !== undefined && Number.isFinite(p)) {
        sum += p
        count++
      }
    }

    words.push({
      text: trimmed,
      start: round(start + offsetSec),
      end: round(end + offsetSec),
      confidence: count > 0 ? round(sum / count, 3) : null,
    })
  }
  return words
}

function round(x: number, digits = 2): number {
  const k = 10 ** digits
  return Math.round(x * k) / k
}
