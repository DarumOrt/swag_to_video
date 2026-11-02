import type { DecodedAudio } from './types'

/** Input rate expected by Whisper and the aligner. */
export const ML_SAMPLE_RATE = 16000

/** Zero crossings of the sinc kernel on each side; more = steeper anti-aliasing filter. */
const KERNEL_ZERO_CROSSINGS = 16
/** Passband edge as a fraction of the lower Nyquist frequency. */
const CUTOFF = 0.94
/** Max number of precomputed kernel phases; exact for every common rate pair. */
const MAX_PHASES = 4096

/** Average of all channels. */
export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  const first = channels[0]
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return first.slice()
  const out = new Float32Array(first.length)
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + channel[i]!
  }
  const scale = 1 / channels.length
  for (let i = 0; i < out.length; i++) out[i] = out[i]! * scale
  return out
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b]
  return a
}

/**
 * Band-limited resampling with a Blackman-windowed sinc and precomputed polyphase kernels.
 * Pure and deterministic; ~0.5 s for 3 minutes of 48 kHz audio.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice()
  const ratio = toRate / fromRate
  const outLength = Math.round(input.length * ratio)
  const out = new Float32Array(outLength)
  if (outLength === 0 || input.length === 0) return out

  // Cutoff in cycles per input sample.
  const fc = 0.5 * Math.min(1, ratio) * CUTOFF
  const halfWidth = Math.ceil(KERNEL_ZERO_CROSSINGS / (2 * fc))
  const taps = 2 * halfWidth
  const up = Math.round(toRate) / gcd(Math.round(toRate), Math.round(fromRate))
  const phases = Math.min(up, MAX_PHASES)

  // kernels[p * taps + k] weights input sample (base - halfWidth + 1 + k) for an output whose
  // position is base + p / phases.
  const kernels = new Float64Array(phases * taps)
  for (let p = 0; p < phases; p++) {
    let sum = 0
    for (let k = 0; k < taps; k++) {
      const t = k - halfWidth + 1 - p / phases
      const x = 2 * fc * t
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const u = (t + halfWidth) / (2 * halfWidth)
      const window =
        u <= 0 || u >= 1
          ? 0
          : 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u)
      const value = sinc * window
      kernels[p * taps + k] = value
      sum += value
    }
    // Unity DC gain for every phase.
    for (let k = 0; k < taps; k++) kernels[p * taps + k] = kernels[p * taps + k]! / sum
  }

  const n = input.length
  for (let j = 0; j < outLength; j++) {
    const position = j / ratio
    let base = Math.floor(position)
    let phase = Math.round((position - base) * phases)
    if (phase === phases) {
      base++
      phase = 0
    }
    const first = base - halfWidth + 1
    const offset = phase * taps
    let acc = 0
    if (first >= 0 && first + taps <= n) {
      for (let k = 0; k < taps; k++) acc += input[first + k]! * kernels[offset + k]!
    } else {
      for (let k = 0; k < taps; k++) {
        const i = first + k
        if (i >= 0 && i < n) acc += input[i]! * kernels[offset + k]!
      }
    }
    out[j] = acc
  }
  return out
}

/** Mono 16 kHz copy for the ML models (Whisper, aligner). */
export function toMono16k(pcm: DecodedAudio): Float32Array {
  return resample(downmixToMono(pcm.channels), pcm.sampleRate, ML_SAMPLE_RATE)
}
