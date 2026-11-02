import { describe, expect, it } from 'vitest'
import type { LyricLine, LyricWord } from '@/shared'
import { placeWords } from './lyrics'
import {
  computeLineTimings,
  lineStateAt,
  timeLineWords,
  wordProgress,
  type LyricsTimingOptions,
} from './lyricsTiming'

const word = (id: string, text: string, start: number | null, end: number | null): LyricWord => ({
  id,
  text,
  start,
  end,
  confidence: null,
  timingSource: start === null ? null : 'manual',
})

const line = (id: string, words: LyricWord[]): LyricLine => ({ id, words })

const opts: LyricsTimingOptions = {
  leadInSec: 0.5,
  holdSec: 1,
  previewLeadSec: 0.8,
  transitionSec: 0.2,
}

describe('timeLineWords', () => {
  it('fills untimed words from their timed neighbours', () => {
    const w = timeLineWords(
      line('l', [word('a', 'раз', 1, 1.4), word('b', 'два', null, null), word('c', 'три', 2, 2.5)]),
      true,
    )
    expect(w.map((x) => [x.start, x.end, x.timed])).toEqual([
      [1, 1.4, true],
      [1.4, 2, false],
      [2, 2.5, true],
    ])
  })

  it('drops untimed words in hide mode and lines without any timing', () => {
    const l = line('l', [word('a', 'one', 1, 2), word('b', 'two', null, null)])
    expect(timeLineWords(l, false).map((x) => x.id)).toEqual(['a'])
    expect(timeLineWords(line('x', [word('a', 'one', null, null)]), true)).toEqual([])
  })
})

describe('computeLineTimings', () => {
  const lines = [
    line('l0', [word('a', 'a', 2, 3), word('b', 'b', 3, 4)]),
    line('l1', [word('c', 'c', 4.2, 5)]),
    line('untimed', [word('d', 'd', null, null)]),
    line('l2', [word('e', 'e', 10, 11)]),
  ]
  const t = computeLineTimings(lines, opts)

  it('skips lines without timing and keeps time order', () => {
    expect(t.map((l) => l.id)).toEqual(['l0', 'l1', 'l2'])
  })

  it('appears with lead-in, but not before the previous line ends', () => {
    expect(t[0]?.appear).toBeCloseTo(1.5)
    expect(t[1]?.appear).toBeCloseTo(4)
    expect(t[2]?.appear).toBeCloseTo(9.5)
  })

  it('leaves when the next line takes over or after the hold', () => {
    expect(t[0]?.disappear).toBeCloseTo(4)
    expect(t[1]?.disappear).toBeCloseTo(6)
    expect(t[2]?.disappear).toBeCloseTo(12)
  })

  it('previews back-to-back lines with the previous one, after a pause only shortly before', () => {
    expect(t[1]?.previewStart).toBeCloseTo(1.5)
    expect(t[2]?.previewStart).toBeCloseTo(8.7)
  })
})

describe('lineStateAt', () => {
  const [l] = computeLineTimings([line('l', [word('a', 'a', 2, 3)])], opts)
  if (!l) throw new Error('no timing')

  it('is hidden before the preview and after leaving', () => {
    expect(lineStateAt(l, 0, 0.2)).toBeNull()
    expect(lineStateAt(l, 4.3, 0.2)).toBeNull()
  })

  it('moves preview → current → gone', () => {
    expect(lineStateAt(l, 1.2, 0.2)?.slot).toBe(1)
    expect(lineStateAt(l, 2.5, 0.2)?.slot).toBe(0)
    expect(lineStateAt(l, 4.1, 0.2)?.slot).toBeCloseTo(-0.5)
  })

  it('is continuous at phase boundaries', () => {
    for (const edge of [l.appear, l.disappear]) {
      const a = lineStateAt(l, edge - 1e-6, 0.2)?.slot ?? NaN
      const b = lineStateAt(l, edge + 1e-6, 0.2)?.slot ?? NaN
      expect(Math.abs(a - b)).toBeLessThan(1e-3)
    }
  })
})

describe('wordProgress', () => {
  it('goes 0 → 1 across the word', () => {
    const w = { start: 1, end: 2 }
    expect(wordProgress(w, 0.5)).toBe(0)
    expect(wordProgress(w, 1.25)).toBe(0.25)
    expect(wordProgress(w, 3)).toBe(1)
    expect(wordProgress({ start: 1, end: 1 }, 1)).toBe(0)
    expect(wordProgress({ start: 1, end: 1 }, 1.01)).toBe(1)
  })
})

describe('placeWords', () => {
  it('assigns words to rows in order with spans from measured prefixes', () => {
    const words = ['свет', 'в', 'ночи'].map((text, i) => ({
      id: String(i),
      text,
      start: i,
      end: i + 1,
      timed: true,
    }))
    const rows = placeWords(['свет в', 'ночи'], words, (s) => s.length)
    expect(rows[0]?.words.map((w) => [w.x0, w.x1])).toEqual([
      [0, 4],
      [5, 6],
    ])
    expect(rows[1]?.words.map((w) => [w.x0, w.x1, w.start])).toEqual([[0, 4, 2]])
    expect(rows[1]?.width).toBe(4)
  })
})
