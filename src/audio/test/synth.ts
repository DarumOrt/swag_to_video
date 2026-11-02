import type { DecodedAudio } from '../types'

/** Synthetic test signals. Deterministic (no Math.random). */

export function pcmOf(sampleRate: number, ...channels: Float32Array[]): DecodedAudio {
  return { sampleRate, channels, durationSec: (channels[0]?.length ?? 0) / sampleRate }
}

export function silence(sampleRate: number, seconds: number): Float32Array {
  return new Float32Array(Math.round(sampleRate * seconds))
}

export function sine(
  sampleRate: number,
  seconds: number,
  hz: number,
  amplitude = 1,
  phase = 0,
): Float32Array {
  const out = silence(sampleRate, seconds)
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate + phase)
  }
  return out
}

/** Short decaying noise bursts ("clicks") at the given times. */
export function clicks(sampleRate: number, seconds: number, times: number[]): Float32Array {
  const out = silence(sampleRate, seconds)
  const random = lcg(12345)
  const length = Math.round(0.01 * sampleRate)
  for (const t of times) {
    const start = Math.round(t * sampleRate)
    for (let k = 0; k < length && start + k < out.length; k++) {
      out[start + k] = 0.8 * (random() * 2 - 1) * Math.exp(-k / (0.002 * sampleRate))
    }
  }
  return out
}

export function clickTimes(bpm: number, seconds: number, startSec = 0): number[] {
  const times: number[] = []
  for (let t = startSec; t < seconds - 0.05; t += 60 / bpm) times.push(t)
  return times
}

/** Seeded uniform 0..1 generator. */
export function lcg(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}
