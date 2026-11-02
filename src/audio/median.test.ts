import { describe, expect, it } from 'vitest'
import { slidingMedian } from './median'
import { lcg } from './test/synth'

function naiveMedian(values: number[], radius: number): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i - radius), i + radius + 1).sort((a, b) => a - b)
    const mid = window.length >> 1
    return window.length % 2 ? window[mid]! : 0.5 * (window[mid - 1]! + window[mid]!)
  })
}

describe('slidingMedian', () => {
  it('matches a naive median, including the shrinking edges', () => {
    const random = lcg(3)
    const values = Array.from({ length: 200 }, () => Math.fround(random()))
    const out = new Float32Array(values.length)
    slidingMedian(Float32Array.from(values), out, values.length, 0, 1, 7)
    const expected = naiveMedian(values, 7)
    for (let i = 0; i < values.length; i++) expect(out[i]).toBeCloseTo(expected[i]!, 6)
  })

  it('works on a strided column', () => {
    const src = new Float32Array(30)
    for (let i = 0; i < 10; i++) src[i * 3 + 1] = i % 3
    const out = new Float32Array(30)
    slidingMedian(src, out, 10, 1, 3, 1)
    const column = Array.from({ length: 10 }, (_, i) => out[i * 3 + 1])
    expect(column).toEqual(naiveMedian([0, 1, 2, 0, 1, 2, 0, 1, 2, 0], 1))
  })
})
