import { describe, expect, it } from 'vitest'
import { barEdges, binPosition, rowToBars, smoothedBars } from './spectrumMath'

const grid = { binCount: 101, minHz: 20, maxHz: 20000 }

describe('binPosition / barEdges', () => {
  it('maps grid ends and log midpoint', () => {
    expect(binPosition(grid, 20)).toBeCloseTo(0)
    expect(binPosition(grid, 20000)).toBeCloseTo(100)
    expect(binPosition(grid, Math.sqrt(20 * 20000))).toBeCloseTo(50)
  })

  it('produces barCount + 1 increasing edges', () => {
    const e = barEdges(grid, 16, 30, 16000)
    expect(e.length).toBe(17)
    for (let i = 1; i < e.length; i++) expect(e[i]).toBeGreaterThan(e[i - 1] ?? 0)
  })
})

describe('rowToBars', () => {
  it('takes the max of covered bins for wide bars', () => {
    const row = Float32Array.from([0.1, 0.9, 0.2, 0.3, 0.4])
    const out = new Float32Array(2)
    rowToBars(row, Float32Array.from([0, 2, 4]), out)
    expect(Array.from(out).map((v) => +v.toFixed(2))).toEqual([0.9, 0.4])
  })

  it('interpolates at the center for narrow bars', () => {
    const row = Float32Array.from([0, 1])
    const out = new Float32Array(1)
    rowToBars(row, Float32Array.from([0.2, 0.4]), out)
    expect(out[0]).toBeCloseTo(0.3)
  })
})

describe('smoothedBars', () => {
  // One bin, one bar; an impulse at feature frame 10.
  const rate = 60
  const series = new Float32Array(200)
  series[10] = 1
  const spectrumAt = (pos: number, out: Float32Array) => {
    out[0] = series[Math.round(pos)] ?? 0
  }
  const edges = Float32Array.from([0, 0])
  const run = (pos: number, releaseSec: number) => {
    const out = new Float32Array(1)
    smoothedBars(pos, edges, 1, { rate, releaseSec }, spectrumAt, out, {
      row: new Float32Array(0),
      bars: new Float32Array(0),
    })
    return out[0] ?? 0
  }

  it('attacks instantly and releases exponentially', () => {
    expect(run(9, 0.1)).toBe(0)
    expect(run(10, 0.1)).toBe(1)
    expect(run(16, 0.1)).toBeCloseTo(Math.exp(-6 / (rate * 0.1)), 5)
  })

  it('without release follows the raw value', () => {
    expect(run(11, 0)).toBe(0)
  })

  it('is a pure function of position', () => {
    const a = run(14, 0.2)
    run(50, 0.2)
    run(3, 0.2)
    expect(run(14, 0.2)).toBe(a)
  })
})
