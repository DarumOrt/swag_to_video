import { parabolicOffset, percentile } from './util'

/*
 * Onsets, tempo and beats from a spectral-flux onset envelope sampled at `rate` frames per second.
 * Frame positions are converted to seconds by the caller-supplied `frameTime`.
 */

export type FrameTime = (framePosition: number) => number

export const MIN_BPM = 40
export const MAX_BPM = 240
/** Center of the tempo prior; tempi an octave away are weighted down to e^-0.5. */
const PRIOR_BPM = 120

// ---------------------------------------------------------------------------
// Onsets
// ---------------------------------------------------------------------------

/** Onset strength below this (sum of log-amplitude increases) is never an onset. */
export const MIN_ONSET_STRENGTH = 1

/** Robust envelope scale, so a single huge hit does not hide everything else. */
export function onsetScale(envelope: Float32Array): number {
  let max = 0
  for (let i = 0; i < envelope.length; i++) max = Math.max(max, envelope[i]!)
  return max > 0 ? Math.max(percentile(envelope, 0.995), 0.1 * max) : 0
}

/**
 * Peak picking: local max that rises above the local mean by `delta` of the envelope scale.
 * `minScale` lets a sub-band envelope be judged against the full-band one.
 */
export function pickOnsets(
  envelope: Float32Array,
  rate: number,
  frameTime: FrameTime,
  minScale = 0,
): Float32Array {
  const n = envelope.length
  const scale = Math.max(onsetScale(envelope), minScale)
  if (scale <= 0) return new Float32Array(0)

  const preAvg = Math.round(0.1 * rate)
  const postAvg = Math.round(0.05 * rate)
  const maxRadius = Math.max(1, Math.round(0.03 * rate))
  const wait = Math.max(1, Math.round(0.05 * rate))
  const delta = 0.07 * scale

  const times: number[] = []
  let last = -Infinity
  for (let i = 0; i < n; i++) {
    const v = envelope[i]!
    if (v < MIN_ONSET_STRENGTH) continue
    let isMax = true
    for (let j = Math.max(0, i - maxRadius); j <= Math.min(n - 1, i + maxRadius); j++) {
      const u = envelope[j]!
      // Ties resolve to the first frame of a plateau.
      if (u > v || (u === v && j < i)) {
        isMax = false
        break
      }
    }
    if (!isMax) continue
    let sum = 0
    const from = Math.max(0, i - preAvg)
    const to = Math.min(n - 1, i + postAvg)
    for (let j = from; j <= to; j++) sum += envelope[j]!
    if (v < sum / (to - from + 1) + delta) continue
    if (i - last <= wait) continue
    last = i
    times.push(frameTime(i + parabolicOffset(envelope, i)))
  }
  return Float32Array.from(times)
}

// ---------------------------------------------------------------------------
// Tempo
// ---------------------------------------------------------------------------

export interface TempoEstimate {
  bpm: number
  /** Beat period in frames. */
  period: number
}

/** Linear interpolation into the envelope; 0 outside. */
function sampleAt(envelope: Float32Array, position: number): number {
  const i = Math.floor(position)
  if (i < 0 || i >= envelope.length - 1) return 0
  const f = position - i
  return envelope[i]! * (1 - f) + envelope[i + 1]! * f
}

/** Best average envelope value on a grid with this period, over all phases. */
function combScore(envelope: Float32Array, period: number): number {
  let best = 0
  const phaseStep = 0.25
  for (let phase = 0; phase < period; phase += phaseStep) {
    let sum = 0
    let count = 0
    for (let p = phase; p < envelope.length; p += period) {
      sum += sampleAt(envelope, p)
      count++
    }
    if (count > 0) best = Math.max(best, sum / count)
  }
  return best
}

/**
 * Global tempo: autocorrelation of the onset envelope weighted by a log-normal prior around
 * 120 BPM picks the tempo octave, then a fine comb search refines it to ~0.05 BPM.
 */
export function estimateTempo(envelope: Float32Array, rate: number): TempoEstimate | null {
  const n = envelope.length
  const minLag = Math.max(1, Math.floor((60 * rate) / MAX_BPM))
  const maxLag = Math.ceil((60 * rate) / MIN_BPM)
  if (n < maxLag * 2) return null

  let mean = 0
  for (let i = 0; i < n; i++) mean += envelope[i]!
  mean /= n
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) x[i] = envelope[i]! - mean

  let bestLag = 0
  let bestScore = 0
  const scores = new Float64Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let acf = 0
    for (let i = 0; i + lag < n; i++) acf += x[i]! * x[i + lag]!
    acf /= n - lag
    const bpm = (60 * rate) / lag
    const octaves = Math.log2(bpm / PRIOR_BPM)
    const score = acf * Math.exp(-0.5 * octaves * octaves)
    scores[lag] = score
    if (lag <= maxLag && score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag === 0) return null

  const coarseLag = bestLag + parabolicOffset(scores, bestLag)
  const coarseBpm = (60 * rate) / coarseLag

  let bestBpm = coarseBpm
  let bestComb = -1
  const span = 0.04 * coarseBpm
  for (let bpm = coarseBpm - span; bpm <= coarseBpm + span; bpm += 0.05) {
    const score = combScore(envelope, (60 * rate) / bpm)
    if (score > bestComb) {
      bestComb = score
      bestBpm = bpm
    }
  }
  return { bpm: bestBpm, period: (60 * rate) / bestBpm }
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

/** How strongly beat intervals are pulled toward the global period. */
const TIGHTNESS = 100

/**
 * Dynamic-programming beat tracker: maximizes onset strength at beats minus a penalty for
 * intervals that deviate from the period (log-ratio squared). Returns beat times in seconds.
 */
export function trackBeats(
  envelope: Float32Array,
  period: number,
  frameTime: FrameTime,
): Float32Array {
  const n = envelope.length
  if (n === 0 || period <= 1) return new Float32Array(0)

  // Smooth with a narrow Gaussian and normalize by standard deviation.
  const sigma = Math.max(1, period / 32)
  const radius = Math.ceil(3 * sigma)
  const kernel = new Float64Array(2 * radius + 1)
  for (let k = -radius; k <= radius; k++) kernel[k + radius] = Math.exp(-0.5 * (k / sigma) ** 2)
  const local = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let acc = 0
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j >= 0 && j < n) acc += envelope[j]! * kernel[k + radius]!
    }
    local[i] = acc
  }
  let mean = 0
  for (let i = 0; i < n; i++) mean += local[i]!
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) variance += (local[i]! - mean) ** 2
  const std = Math.sqrt(variance / n)
  if (std === 0) return new Float32Array(0)
  for (let i = 0; i < n; i++) local[i] = local[i]! / std

  const score = new Float64Array(n)
  const back = new Int32Array(n).fill(-1)
  const minGap = Math.max(1, Math.round(period / 2))
  const maxGap = Math.round(2 * period)
  for (let t = 0; t < n; t++) {
    let best = -Infinity
    let bestPrev = -1
    for (let prev = t - maxGap; prev <= t - minGap; prev++) {
      if (prev < 0) continue
      const ratio = Math.log((t - prev) / period)
      const candidate = score[prev]! - TIGHTNESS * ratio * ratio
      if (candidate > best) {
        best = candidate
        bestPrev = prev
      }
    }
    if (bestPrev >= 0 && best > 0) {
      score[t] = local[t]! + best
      back[t] = bestPrev
    } else {
      score[t] = local[t]!
    }
  }

  // Last beat: the last local maximum of the cumulative score above half their median.
  const peaks: number[] = []
  for (let t = 1; t < n - 1; t++) {
    if (score[t]! > score[t - 1]! && score[t]! >= score[t + 1]!) peaks.push(t)
  }
  if (peaks.length === 0) return new Float32Array(0)
  const median = percentile(
    peaks.map((t) => score[t]!),
    0.5,
  )
  let end = peaks[peaks.length - 1]!
  for (let k = peaks.length - 1; k >= 0; k--) {
    if (score[peaks[k]!]! >= 0.5 * median) {
      end = peaks[k]!
      break
    }
  }

  const frames: number[] = []
  for (let t = end; t >= 0; t = back[t]!) frames.push(t)
  frames.reverse()

  // Trim weak beats at the edges (silence, fades).
  let energy = 0
  for (let i = 0; i < n; i++) energy += local[i]! * local[i]!
  const threshold = 0.5 * Math.sqrt(energy / n)
  let first = 0
  let last = frames.length - 1
  while (first <= last && local[frames[first]!]! < threshold) first++
  while (last >= first && local[frames[last]!]! < threshold) last--

  const times: number[] = []
  for (let k = first; k <= last; k++) {
    const t = frames[k]!
    times.push(frameTime(t + parabolicOffset(local, t)))
  }
  return Float32Array.from(times)
}

/**
 * Approximate downbeats assuming 4/4: of the four possible bar phases, the one whose beats carry
 * the most low-band energy (kick) wins.
 */
export function pickDownbeats(
  beats: Float32Array,
  lowEnergy: ArrayLike<number>,
  timeToFrame: (time: number) => number,
): Float32Array {
  if (beats.length === 0) return new Float32Array(0)
  const totals = [0, 0, 0, 0]
  for (let k = 0; k < beats.length; k++) {
    totals[k % 4]! += lowEnergy[timeToFrame(beats[k]!)] ?? 0
  }
  let phase = 0
  for (let p = 1; p < 4; p++) if (totals[p]! > totals[phase]!) phase = p
  const out: number[] = []
  for (let k = phase; k < beats.length; k += 4) out.push(beats[k]!)
  return Float32Array.from(out)
}
