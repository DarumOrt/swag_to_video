import { describe, expect, it } from 'vitest'
import { featureIndexAt, type FrameFeatures } from '@/shared'
import { featurePosition, frameTime, sampleSeries, sampleSpectrum } from './sampling'

const features = (rate: number, frameCount: number, binCount = 2, data?: number[]) =>
  ({
    rate,
    frameCount,
    spectrum: {
      binCount,
      minHz: 20,
      maxHz: 20000,
      data: data ? Float32Array.from(data) : new Float32Array(frameCount * binCount),
    },
  }) as FrameFeatures

describe('frame → time / feature position', () => {
  it('time is frameIndex / fps', () => {
    expect(frameTime(0, 30)).toBe(0)
    expect(frameTime(45, 30)).toBe(1.5)
  })

  it('lands exactly on frame n when fps equals the feature rate', () => {
    const f = features(60, 10_000)
    for (let n = 0; n < 5000; n++) expect(featurePosition(f, n, 60)).toBe(n)
  })

  it('avoids the float error of floor((n / fps) * rate)', () => {
    // 245 / 60 * 60 = 244.99999999999997; featureIndexAt now compensates with an epsilon.
    const f = features(60, 10_000)
    expect(featureIndexAt(f, 245 / 60)).toBe(245)
    expect(featurePosition(f, 245, 60)).toBe(245)
  })

  it('stays on exact grid points for integer rate/fps ratios', () => {
    const f = features(60, 10_000)
    expect(featurePosition(f, 333, 30)).toBe(666)
    expect(featurePosition(f, 1, 24)).toBe(2.5)
  })

  it('clamps to the feature range', () => {
    const f = features(60, 100)
    expect(featurePosition(f, -5, 30)).toBe(0)
    expect(featurePosition(f, 10_000, 30)).toBe(99)
  })
})

describe('sampleSeries', () => {
  const s = Float32Array.from([0, 1, 0.5])

  it('returns grid values at integer positions', () => {
    expect(sampleSeries(s, 1)).toBe(1)
  })

  it('interpolates between frames', () => {
    expect(sampleSeries(s, 0.25)).toBeCloseTo(0.25)
    expect(sampleSeries(s, 1.5)).toBeCloseTo(0.75)
  })

  it('clamps and handles empty series', () => {
    expect(sampleSeries(s, 99)).toBeCloseTo(0.5)
    expect(sampleSeries(s, -1)).toBe(0)
    expect(sampleSeries(new Float32Array(0), 3)).toBe(0)
  })
})

describe('sampleSpectrum', () => {
  it('interpolates whole rows', () => {
    const f = features(60, 2, 2, [0, 1, 1, 0])
    const out = new Float32Array(2)
    sampleSpectrum(f, 0.5, out)
    expect(Array.from(out)).toEqual([0.5, 0.5])
    sampleSpectrum(f, 1, out)
    expect(Array.from(out)).toEqual([1, 0])
  })
})
