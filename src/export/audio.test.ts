import { describe, expect, it } from 'vitest'
import { mixdown, pcmLength, resampleLinear, type PcmAudio } from './audio'

const pcm = (sampleRate: number, ...channels: number[][]): PcmAudio => ({
  sampleRate,
  channels: channels.map((c) => Float32Array.from(c)),
})

describe('mixdown', () => {
  it('keeps the first two channels of surround audio', () => {
    const result = mixdown(pcm(48_000, [1], [2], [3], [4], [5], [6]), 2)
    expect(result.channels.map((c) => c[0])).toEqual([1, 2])
  })

  it('averages into mono', () => {
    const result = mixdown(pcm(48_000, [1, 0], [0, 1]), 1)
    expect(Array.from(result.channels[0]!)).toEqual([0.5, 0.5])
  })
})

describe('resampleLinear', () => {
  it('changes length proportionally and keeps the rate', () => {
    const input = pcm(
      44_100,
      Array.from({ length: 44_100 }, () => 0.25),
    )
    const output = resampleLinear(input, 48_000)
    expect(output.sampleRate).toBe(48_000)
    expect(pcmLength(output)).toBe(48_000)
    expect(output.channels[0]![1000]).toBeCloseTo(0.25)
  })

  it('interpolates between samples', () => {
    const output = resampleLinear(pcm(1, [0, 1]), 2)
    expect(Array.from(output.channels[0]!)).toEqual([0, 0.5, 1, 1])
  })
})
