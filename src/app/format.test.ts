import { describe, expect, it } from 'vitest'
import { matchesAccept } from '@/ui/accept'
import { formatBytes, formatTime } from './format'

describe('formatTime', () => {
  it('formats minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65.9)).toBe('1:05')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  it('adds tenths on request and survives bad input', () => {
    expect(formatTime(65.97, true)).toBe('1:05.9')
    expect(formatTime(Number.NaN)).toBe('0:00')
    expect(formatTime(-3)).toBe('0:00')
  })
})

describe('formatBytes', () => {
  it('picks a unit and uses a decimal comma', () => {
    expect(formatBytes(512)).toBe('512 Б')
    expect(formatBytes(1536)).toBe('1,5 КБ')
    expect(formatBytes(8.4 * 1024 * 1024)).toBe('8,4 МБ')
  })
})

describe('matchesAccept', () => {
  const accept = 'audio/*,.flac'
  it('accepts by MIME wildcard or extension', () => {
    expect(matchesAccept({ name: 'a.mp3', type: 'audio/mpeg' }, accept)).toBe(true)
    expect(matchesAccept({ name: 'A.FLAC', type: '' }, accept)).toBe(true)
    expect(matchesAccept({ name: 'cover.png', type: 'image/png' }, accept)).toBe(false)
  })
})
