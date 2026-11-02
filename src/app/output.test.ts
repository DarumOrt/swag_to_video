import { describe, expect, it } from 'vitest'
import { DEFAULT_OUTPUT } from '@/shared'
import { nearestShortSide, sizeFor, withAspect, withShortSide } from './output'

describe('sizeFor', () => {
  it('uses the short side for both orientations', () => {
    expect(sizeFor('9:16', 1080)).toEqual({ width: 1080, height: 1920 })
    expect(sizeFor('16:9', 1080)).toEqual({ width: 1920, height: 1080 })
    expect(sizeFor('1:1', 720)).toEqual({ width: 720, height: 720 })
    expect(sizeFor('4:5', 1080)).toEqual({ width: 1080, height: 1350 })
    expect(sizeFor('9:16', 2160)).toEqual({ width: 2160, height: 3840 })
  })

  it('always returns even dimensions', () => {
    const { width, height } = sizeFor('4:5', 721)
    expect(width % 2).toBe(0)
    expect(height % 2).toBe(0)
  })
})

describe('output updates', () => {
  it('keeps the resolution class when switching aspect', () => {
    const wide = withAspect(DEFAULT_OUTPUT, '16:9')
    expect(wide).toMatchObject({ aspect: '16:9', width: 1920, height: 1080, fps: 30 })
  })

  it('changes resolution within the aspect', () => {
    expect(withShortSide(DEFAULT_OUTPUT, 720)).toMatchObject({ width: 720, height: 1280 })
  })

  it('maps arbitrary sizes to the nearest preset', () => {
    expect(nearestShortSide({ width: 1000, height: 1800 })).toBe(1080)
    expect(nearestShortSide({ width: 3840, height: 2100 })).toBe(2160)
  })
})
