import { describe, expect, it } from 'vitest'
import { exportFileName, pickSaveTarget } from './saveTarget'

describe('exportFileName', () => {
  it('adds the container extension', () => {
    expect(exportFileName('Another One', 'mp4')).toBe('Another One.mp4')
    expect(exportFileName('Адская колыбельная', 'webm')).toBe('Адская колыбельная.webm')
  })

  it('replaces characters Windows rejects', () => {
    expect(exportFileName('AC/DC: "Live"?', 'mp4')).toBe('AC_DC_ _Live_.mp4')
  })

  it('falls back to "video"', () => {
    expect(exportFileName('  ', 'mp4')).toBe('video.mp4')
  })
})

describe('pickSaveTarget', () => {
  it('falls back to memory when no file APIs exist (Node)', async () => {
    const target = await pickSaveTarget('song', 'mp4')
    expect(target.kind).toBe('memory')
    expect(target.file).toBeNull()
    expect(target.name).toBe('song.mp4')
  })
})
