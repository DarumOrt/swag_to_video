import { describe, expect, it } from 'vitest'
import { hash32, createRng } from './random'
import { createDefaultScene, normalizeScene } from './scene'
import { linearGradientPoints } from './layers/background'
import { wrapText } from './layers/text'

describe('normalizeScene', () => {
  it('fills defaults for omitted layer fields', () => {
    const s = normalizeScene({ layers: [{ id: 'bars', type: 'spectrum-bars', barCount: 12 }] })
    const bars = s.layers[0]
    expect(bars?.type).toBe('spectrum-bars')
    if (bars?.type !== 'spectrum-bars') return
    expect(bars.barCount).toBe(12)
    expect(bars.gap).toBeGreaterThan(0)
    expect(s.safeArea).toBe('social')
    expect(s.seed).toBe(1)
  })

  it('does not share default objects between scenes', () => {
    const a = normalizeScene({ layers: [{ id: 'bg', type: 'background' }] })
    const b = normalizeScene({ layers: [{ id: 'bg', type: 'background' }] })
    expect(a.layers[0]).toEqual(b.layers[0])
    expect(a.layers[0]).not.toBe(b.layers[0])
    if (a.layers[0]?.type === 'background' && b.layers[0]?.type === 'background') {
      expect(a.layers[0].fill).not.toBe(b.layers[0].fill)
    }
  })

  it('returns the default scene for null', () => {
    expect(normalizeScene(null)).toEqual(createDefaultScene())
  })

  it('rejects unknown types, missing and duplicate ids', () => {
    expect(() => normalizeScene({ layers: [{ id: 'x', type: 'nope' }] })).toThrow(/Unknown layer/)
    expect(() => normalizeScene({ layers: [{ type: 'background' }] })).toThrow(/no id/)
    expect(() =>
      normalizeScene({
        layers: [
          { id: 'a', type: 'background' },
          { id: 'a', type: 'background' },
        ],
      }),
    ).toThrow(/Duplicate/)
    expect(() => normalizeScene({})).toThrow()
  })
})

describe('seeded randomness', () => {
  it('repeats for the same seed and differs for others', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true)
  })

  it('hash32 separates parts', () => {
    expect(hash32('ab', 'c')).not.toBe(hash32('a', 'bc'))
    expect(hash32(1, 'bg')).toBe(hash32(1, 'bg'))
  })
})

describe('linearGradientPoints', () => {
  it('follows CSS angles', () => {
    const down = linearGradientPoints(100, 200, 180)
    expect(down.map((v) => Math.round(v) + 0)).toEqual([50, 0, 50, 200])
    const right = linearGradientPoints(100, 200, 90)
    expect(right.map((v) => Math.round(v) + 0)).toEqual([0, 100, 100, 100])
  })
})

describe('wrapText', () => {
  const measure = (s: string) => s.length

  it('wraps greedily by width', () => {
    expect(wrapText('один два три четыре', 9, measure)).toEqual(['один два', 'три', 'четыре'])
  })

  it('keeps explicit line breaks and long words', () => {
    expect(wrapText('a\nсуперсловище b', 5, measure)).toEqual(['a', 'суперсловище', 'b'])
  })
})
