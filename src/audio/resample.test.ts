import { describe, expect, it } from 'vitest'
import { downmixToMono, ML_SAMPLE_RATE, resample, toMono16k } from './resample'
import { pcmOf, sine } from './test/synth'

function rms(array: Float32Array, from = 0, to = array.length): number {
  let sum = 0
  for (let i = from; i < to; i++) sum += array[i]! ** 2
  return Math.sqrt(sum / (to - from))
}

describe('resample', () => {
  for (const fromRate of [44100, 48000, 22050]) {
    it(`keeps a 1 kHz sine intact from ${fromRate} Hz`, () => {
      const out = resample(sine(fromRate, 1, 1000), fromRate, ML_SAMPLE_RATE)
      expect(out.length).toBe(ML_SAMPLE_RATE)
      const ideal = sine(ML_SAMPLE_RATE, 1, 1000)
      let maxError = 0
      for (let i = 200; i < out.length - 200; i++) {
        maxError = Math.max(maxError, Math.abs(out[i]! - ideal[i]!))
      }
      expect(maxError).toBeLessThan(0.01)
    })
  }

  it('removes content above the new Nyquist frequency', () => {
    const out = resample(sine(48000, 1, 10000), 48000, ML_SAMPLE_RATE)
    expect(rms(out, 200, out.length - 200)).toBeLessThan(0.003)
  })

  it('returns a copy when rates match', () => {
    const input = sine(16000, 0.1, 100)
    const out = resample(input, 16000, 16000)
    expect(out).toEqual(input)
    expect(out).not.toBe(input)
  })
})

describe('toMono16k', () => {
  it('downmixes and resamples', () => {
    const left = sine(44100, 2, 500, 0.5)
    const right = left.map((v) => -v)
    expect(rms(downmixToMono([left, right]))).toBe(0)
    const out = toMono16k(pcmOf(44100, left, left))
    expect(out.length).toBe(32000)
    expect(rms(out, 1000, 31000)).toBeCloseTo(0.5 * Math.SQRT1_2, 3)
  })
})
