import { describe, expect, it } from 'vitest'
import { flattenWords } from './model'
import { formatLrcTime, parseLrc, toLrc } from './lrc'
import { expectPlayable, timesOf } from './testing'

describe('formatLrcTime', () => {
  it('formats mm:ss.xx', () => {
    expect(formatLrcTime(0)).toBe('00:00.00')
    expect(formatLrcTime(65.456)).toBe('01:05.46')
    expect(formatLrcTime(59.999)).toBe('01:00.00')
  })
})

describe('parseLrc', () => {
  it('reads line tags, metadata and spreads words inside a line', () => {
    const { lyrics, metadata } = parseLrc(
      `[ar:Test Band]
[ti:Night Tram]
[00:01.00]Ночной трамвай
[00:03.50]Везёт меня домой`,
    )
    expect(metadata).toEqual({ ar: 'Test Band', ti: 'Night Tram' })
    expect(lyrics.lines).toHaveLength(2)
    const [first, second] = flattenWords(lyrics).map((r) => r.word)
    expect(first!.start).toBe(1)
    expect(first!.timingSource).toBe('imported')
    expect(second!.timingSource).toBe('interpolated')
    expect(second!.end).toBeLessThanOrEqual(3.5)
    expectPlayable(lyrics)
  })

  it('caps the last line instead of stretching it forever', () => {
    const { lyrics } = parseLrc('[00:10.00]Огни плывут')
    const last = flattenWords(lyrics).at(-1)!.word
    expect(last.end!).toBeLessThan(13)
  })

  it('expands repeated line tags in time order', () => {
    const { lyrics } = parseLrc(`[00:05.00][00:20.00]Гори, гори
[00:10.00]Моя звезда`)
    expect(lyrics.lines.map((l) => l.words[0]!.start)).toEqual([5, 10, 20])
    expect(lyrics.lines[2]!.id).toBe(`${lyrics.lines[0]!.id}-2`)
  })

  it('applies the offset tag (positive = earlier)', () => {
    const { lyrics } = parseLrc(`[offset:+500]
[00:02.00]hello`)
    expect(lyrics.lines[0]!.words[0]!.start).toBeCloseTo(1.5)
  })

  it('reads Enhanced LRC word tags, including an end tag', () => {
    const { lyrics } = parseLrc(
      '[00:01.00]<00:01.00>Neon <00:01.40>lights <00:02.00>falling <00:03.00>',
    )
    expect(timesOf(lyrics)).toEqual([
      ['Neon', 1, 1.4, 'imported'],
      ['lights', 1.4, 2, 'imported'],
      ['falling', 2, 3, 'imported'],
    ])
  })

  it('shifts word tags of repeated enhanced lines', () => {
    const { lyrics } = parseLrc('[00:01.00][00:11.00]<00:01.00>hey <00:01.50>you <00:02.00>')
    expect(lyrics.lines[1]!.words.map((w) => w.start)).toEqual([11, 11.5])
  })

  it('keeps section labels and untimed lines', () => {
    const { lyrics } = parseLrc(`[Chorus]
[00:01.00]one more time
untimed line`)
    expect(lyrics.lines.map((l) => l.section)).toEqual(['Chorus', 'Chorus'])
    expect(lyrics.lines[1]!.words[0]!.start).toBeNull()
  })
})

describe('toLrc', () => {
  const source = `[Припев]
[00:01.00]<00:01.00>Гори, <00:01.50>гори <00:02.00>звезда <00:03.00>
[00:04.00]<00:04.00>Над <00:04.40>рекой <00:05.00>`

  it('round-trips Enhanced LRC', () => {
    const { lyrics } = parseLrc(source)
    const text = toLrc(lyrics, { enhanced: true, includeSections: true })
    expect(text).toBe(`${source}\n`)
    expect(parseLrc(text).lyrics).toEqual(lyrics)
  })

  it('writes plain LRC with metadata', () => {
    const { lyrics } = parseLrc(source)
    expect(toLrc(lyrics, { metadata: { ti: 'Test' } })).toBe(
      '[ti:Test]\n[00:01.00]Гори, гори звезда\n[00:04.00]Над рекой\n',
    )
  })

  it('writes word end tags only for gaps when asked', () => {
    const { lyrics } = parseLrc('[00:01.00]<00:01.00>one <00:01.30> <00:02.00>two <00:02.50>')
    expect(toLrc(lyrics, { enhanced: true, wordEndTags: true })).toBe(
      '[00:01.00]<00:01.00>one <00:01.30> <00:02.00>two <00:02.50>\n',
    )
  })
})
