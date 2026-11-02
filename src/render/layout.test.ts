import { describe, expect, it } from 'vitest'
import { computeLayout, resolveRect, safeAreaInsets } from './layout'

describe('safeAreaInsets', () => {
  it('reserves social UI space in portrait', () => {
    const i = safeAreaInsets(1080, 1920, 'social')
    expect(i.bottom).toBeGreaterThan(i.top)
    expect(i.right).toBeGreaterThan(i.left)
  })

  it('uses a uniform margin in landscape and square', () => {
    for (const [w, h] of [
      [1920, 1080],
      [1080, 1080],
      [1080, 1350],
    ] as const) {
      const i = safeAreaInsets(w, h, 'social')
      expect(new Set([i.top, i.right, i.bottom, i.left]).size).toBe(1)
    }
  })

  it('is zero with mode none', () => {
    expect(safeAreaInsets(1080, 1920, 'none')).toEqual({ top: 0, right: 0, bottom: 0, left: 0 })
  })
})

describe('computeLayout / resolveRect', () => {
  it('uses the shorter side as unit', () => {
    expect(computeLayout(1080, 1920, 'none').unit).toBe(1080)
    expect(computeLayout(1920, 1080, 'none').unit).toBe(1080)
  })

  it('resolves frame-space rects as plain fractions', () => {
    const l = computeLayout(1080, 1920, 'social')
    expect(resolveRect({ x: 0.5, y: 0.25, w: 0.5, h: 0.5, space: 'frame' }, l)).toEqual({
      x: 540,
      y: 480,
      w: 540,
      h: 960,
    })
  })

  it('resolves safe-space rects inside the safe area', () => {
    const l = computeLayout(1080, 1920, 'social')
    const r = resolveRect({ x: 0, y: 0, w: 1, h: 1 }, l)
    expect(r).toEqual(l.safe)
    expect(r.x).toBeCloseTo(54)
    expect(r.y).toBeCloseTo(192)
    expect(r.x + r.w).toBeCloseTo(1080 - 129.6)
    expect(r.y + r.h).toBeCloseTo(1920 - 384)
  })

  it('scales linearly with resolution', () => {
    const spec = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }
    const a = resolveRect(spec, computeLayout(1080, 1920, 'social'))
    const b = resolveRect(spec, computeLayout(2160, 3840, 'social'))
    expect(b.x).toBeCloseTo(a.x * 2)
    expect(b.w).toBeCloseTo(a.w * 2)
    expect(b.h).toBeCloseTo(a.h * 2)
  })
})
