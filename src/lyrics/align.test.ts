import { describe, expect, it } from 'vitest'
import type { Lyrics } from '@/shared'
import { alignLyrics, matchWords } from './align'
import { flattenWords, parseLyricsText, withWords } from './model'
import { expectPlayable, rec, recEven, wordByText } from './testing'

// All lyrics below are short original lines written for these tests.

describe('matchWords', () => {
  it('pairs fuzzy matches monotonically and skips insertions', () => {
    const matches = matchWords(
      ['ночной', 'трамвай', 'везёт', 'меня', 'домой'],
      ['эээ', 'ночной', 'трамвай', 'везет', 'домои'],
    )
    expect(matches.map((m) => [m.lyricIndex, m.recognizedIndex])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 4],
    ])
  })

  it('respects the threshold parameter', () => {
    expect(matchWords(['привет'], ['привед'], { threshold: 90 })).toEqual([])
    expect(matchWords(['привет'], ['привед'], { threshold: 55 })).toHaveLength(1)
  })
})

describe('alignLyrics — Russian with recognition errors', () => {
  const lyrics = parseLyricsText(`Ночной трамвай везёт меня домой
Огни плывут над тёмною рекой`)
  // "Огни" missed, "домой" misheard, "тёмною" written without ё, one hallucinated word.
  const recognized = rec(
    ['Ночной', 1.0, 1.4],
    ['трамвай', 1.45, 1.9],
    ['везет', 2.0, 2.3],
    ['меня', 2.35, 2.7],
    ['домои', 2.75, 3.3],
    ['ммм', 3.4, 3.5, 0.2],
    ['плывут', 4.0, 4.4],
    ['над', 4.45, 4.6],
    ['темною', 4.65, 5.1],
    ['рекой', 5.15, 5.8],
  )
  const result = alignLyrics(lyrics, recognized)

  it('anchors matched words to recognized timings', () => {
    expect(result.anchoredCount).toBe(9)
    expect(result.wordCount).toBe(10)
    const word = wordByText(result.lyrics, 'везёт')
    expect([word.start, word.end, word.timingSource]).toEqual([2.0, 2.3, 'aligned'])
    expect(word.confidence).toBeCloseTo(0.9)
    expect(wordByText(result.lyrics, 'домой').confidence!).toBeLessThan(0.9)
  })

  it('interpolates the missed word between its neighbours', () => {
    const missed = wordByText(result.lyrics, 'Огни')
    expect(missed.timingSource).toBe('interpolated')
    expect(missed.start!).toBeGreaterThanOrEqual(3.3)
    expect(missed.end!).toBeLessThanOrEqual(4.0)
    expectPlayable(result.lyrics)
  })

  it('does not mutate the input', () => {
    expect(flattenWords(lyrics).every((r) => r.word.start === null)).toBe(true)
  })
})

describe('alignLyrics — repeated chorus', () => {
  const lyrics = parseLyricsText(`Я иду по краю крыши
[Припев]
Гори, гори, моя звезда
[Припев]
Гори, гори, моя звезда`)

  it('keeps repetitions apart when both are recognized', () => {
    const recognized = [
      ...recEven('я иду по краю крыши', 0, 0.4),
      ...recEven('гори гори моя звезда', 10, 0.5),
      ...recEven('гори гори моя звезда', 30, 0.5),
    ]
    const { lyrics: out } = alignLyrics(lyrics, recognized)
    expect(wordByText(out, 'звезда', 0).start).toBe(11.5)
    expect(wordByText(out, 'звезда', 1).start).toBe(31.5)
    expectPlayable(out)
  })

  it('matches a single recognized repetition as a whole, never stitched from both', () => {
    const recognized = [
      ...recEven('я иду по краю крыши', 0, 0.4),
      ...recEven('гори гори моя звезда', 30, 0.5),
    ]
    const { lyrics: out } = alignLyrics(lyrics, recognized)
    const sources = out.lines.slice(1).map((line) => line.words.map((w) => w.timingSource))
    const aligned = sources.filter((s) => s.every((x) => x === 'aligned'))
    const interpolated = sources.filter((s) => s.every((x) => x === 'interpolated'))
    expect([aligned.length, interpolated.length]).toEqual([1, 1])
    expectPlayable(out)
  })
})

describe('alignLyrics — English and mixed', () => {
  it('aligns English with contractions and punctuation', () => {
    const lyrics = parseLyricsText(`Neon lights, they don't sleep tonight`)
    const recognized = rec(
      [' Neon', 0.5, 0.9],
      [' lights,', 0.95, 1.3],
      [' they', 1.35, 1.5],
      [' dont', 1.55, 1.8],
      [' sleep', 1.85, 2.2],
      [' tonight.', 2.25, 2.9],
    )
    const { lyrics: out, anchoredCount } = alignLyrics(lyrics, recognized)
    expect(anchoredCount).toBe(6)
    expect(wordByText(out, "don't").start).toBe(1.55)
  })

  it('matches across scripts via transliteration', () => {
    const lyrics = parseLyricsText('Hey бэйби, я на drive')
    // The recognizer wrote the English words in Cyrillic and vice versa.
    const recognized = rec(
      ['хей', 0, 0.3],
      ['baby', 0.35, 0.8],
      ['я', 0.85, 1],
      ['на', 1.05, 1.2],
      ['драйв', 1.25, 1.8],
    )
    const { lyrics: out, anchoredCount } = alignLyrics(lyrics, recognized)
    expect(anchoredCount).toBe(5)
    expect(wordByText(out, 'drive').start).toBe(1.25)
  })
})

describe('alignLyrics — fast rap with dropped words', () => {
  const text = `Раз-два, микрофон включён, я на бите как на сцене
Каждый слог летит вперёд, рифма падает в обойму`
  const lyrics = parseLyricsText(text)
  const allWords = flattenWords(lyrics).map((r) => r.word.text)
  // ~0.17 s per word, every third word not recognized.
  const recognized = allWords
    .map((w, i) => ({ text: w, start: i * 0.17, end: i * 0.17 + 0.15, confidence: 0.8 }))
    .filter((_, i) => i % 3 !== 1)

  it('times every word playably and keeps interpolated words between anchors', () => {
    const { lyrics: out, anchoredCount } = alignLyrics(lyrics, recognized)
    expect(anchoredCount).toBe(recognized.length)
    expectPlayable(out)
    const words = flattenWords(out)
    words.forEach(({ word }, i) => {
      // The last word is extrapolated (no anchor after it), so only inner words are bounded.
      if (word.timingSource === 'interpolated' && i < words.length - 1) {
        expect(word.start!).toBeGreaterThanOrEqual((i - 1) * 0.17)
        expect(word.end!).toBeLessThanOrEqual((i + 1) * 0.17 + 1e-9)
      }
    })
  })
})

describe('alignLyrics — gaps and edges', () => {
  const lyrics = parseLyricsText(`раз два три
четыре пять`)

  it('treats a long gap as a pause: words stay near their own line', () => {
    const { lyrics: out } = alignLyrics(
      lyrics,
      rec(['раз', 0, 0.4], ['два', 0.5, 0.9], ['пять', 20, 20.5]),
    )
    const three = wordByText(out, 'три')
    const four = wordByText(out, 'четыре')
    expect(three.start!).toBeCloseTo(0.9)
    expect(three.end!).toBeLessThan(1.5)
    expect(four.start!).toBeGreaterThan(18.5)
    expect(four.end!).toBeCloseTo(20)
  })

  it('extrapolates before the first and after the last anchor', () => {
    const { lyrics: out } = alignLyrics(lyrics, rec(['два', 5, 5.4], ['три', 5.5, 5.9]), {
      durationSec: 6.2,
    })
    expect(wordByText(out, 'раз').end!).toBeCloseTo(5)
    expect(wordByText(out, 'раз').start!).toBeGreaterThan(4)
    expect(wordByText(out, 'пять').end!).toBeLessThanOrEqual(6.2)
    expectPlayable(out)
  })

  it('spreads words over the recognized span when nothing matches', () => {
    const { lyrics: out, anchoredCount } = alignLyrics(lyrics, rec(['ла', 2, 2.5], ['ла', 7, 8]))
    expect(anchoredCount).toBe(0)
    expect(wordByText(out, 'раз').start).toBe(2)
    expect(wordByText(out, 'пять').end).toBeCloseTo(8)
  })

  it('returns lyrics unchanged without recognized words', () => {
    expect(alignLyrics(lyrics, []).lyrics).toBe(lyrics)
  })
})

describe('alignLyrics — user timings', () => {
  it('keeps manual timings and drops recognized anchors that contradict them', () => {
    const base = parseLyricsText('раз два три четыре')
    const words = flattenWords(base).map((r) => r.word)
    words[2] = { ...words[2]!, start: 3, end: 3.5, timingSource: 'manual' }
    const lyrics: Lyrics = withWords(base, words)
    // "два" recognized after the manual "три" — must not be used.
    const recognized = rec(['раз', 1, 1.4], ['два', 4, 4.3], ['четыре', 5, 5.5])
    const { lyrics: out } = alignLyrics(lyrics, recognized)
    expect(wordByText(out, 'три')).toMatchObject({ start: 3, end: 3.5, timingSource: 'manual' })
    expect(wordByText(out, 'два').timingSource).toBe('interpolated')
    expect(wordByText(out, 'четыре').start).toBe(5)
    expectPlayable(out)
  })
})

describe('alignLyrics — imported timings', () => {
  const base = parseLyricsText('раз два три')
  const words = flattenWords(base).map((r) => r.word)
  words[1] = { ...words[1]!, start: 2, end: 2.4, timingSource: 'imported' }
  const lyrics = withWords(base, words)
  const recognized = rec(['раз', 1, 1.4], ['два', 5, 5.4], ['три', 6, 6.4])

  it('keeps imported words as fixed anchors by default', () => {
    const { lyrics: out } = alignLyrics(lyrics, recognized)
    expect(wordByText(out, 'два')).toMatchObject({ start: 2, timingSource: 'imported' })
  })

  it('can treat imported words like any other', () => {
    const { lyrics: out } = alignLyrics(lyrics, recognized, { fixedSources: ['manual', 'tap'] })
    expect(wordByText(out, 'два')).toMatchObject({ start: 5, timingSource: 'aligned' })
  })
})

describe('alignLyrics — numbers and hyphens', () => {
  it('matches digits to spelled numbers both ways', () => {
    const lyrics = parseLyricsText('Мне двадцать один, а тебе 2')
    const recognized = rec(
      ['мне', 0, 0.3],
      ['21', 0.35, 1.2],
      ['а', 1.25, 1.35],
      ['тебе', 1.4, 1.8],
      ['два', 1.85, 2.3],
    )
    const { lyrics: out, anchoredCount } = alignLyrics(lyrics, recognized)
    expect(anchoredCount).toBe(6)
    expect(wordByText(out, 'двадцать').start).toBe(0.35)
    expect(wordByText(out, 'один,').end).toBeCloseTo(1.2)
    expect(wordByText(out, '2').start).toBe(1.85)
  })

  it('matches English numbers', () => {
    const lyrics = parseLyricsText('Give me 5 more minutes')
    const recognized = rec(
      ['give', 0, 0.2],
      ['me', 0.25, 0.4],
      ['five', 0.45, 0.8],
      ['more', 0.85, 1],
      ['minutes', 1.05, 1.5],
    )
    expect(alignLyrics(lyrics, recognized).anchoredCount).toBe(5)
  })

  it('matches hyphenated words to split ones and back', () => {
    const lyrics = parseLyricsText('Ну а по-моему всё')
    const split = rec(
      ['ну', 0, 0.2],
      ['а', 0.25, 0.35],
      ['по', 0.4, 0.55],
      ['моему', 0.6, 1.1],
      ['всё', 1.15, 1.5],
    )
    const { lyrics: out } = alignLyrics(lyrics, split)
    expect(wordByText(out, 'по-моему')).toMatchObject({
      start: 0.4,
      end: 1.1,
      timingSource: 'aligned',
    })

    const joined = parseLyricsText('Ну а по моему всё')
    const hyphen = rec(
      ['ну', 0, 0.2],
      ['а', 0.25, 0.35],
      ['по-моему', 0.4, 1.1],
      ['всё', 1.15, 1.5],
    )
    const { lyrics: out2, anchoredCount } = alignLyrics(joined, hyphen)
    expect(anchoredCount).toBe(5)
    expect(wordByText(out2, 'по').start).toBe(0.4)
    expect(wordByText(out2, 'моему').end).toBe(1.1)
  })
})

describe('alignLyrics — which chorus a lone repetition belongs to', () => {
  const lyrics = parseLyricsText(`Я иду по краю крыши
[Припев]
Гори, гори, моя звезда
[Припев]
Гори, гори, моя звезда`)
  const sourcesByLine = (out: Lyrics) =>
    out.lines
      .slice(1)
      .map((l) => (l.words.every((w) => w.timingSource === 'aligned') ? 'aligned' : 'other'))

  it('late chorus near the end of the track → second repetition', () => {
    const recognized = [
      ...recEven('я иду по краю крыши', 0, 0.4),
      ...recEven('гори гори моя звезда', 30, 0.5),
    ]
    const { lyrics: out } = alignLyrics(lyrics, recognized, { durationSec: 33 })
    expect(sourcesByLine(out)).toEqual(['other', 'aligned'])
  })

  it('early chorus in a long track → first repetition', () => {
    const recognized = [
      ...recEven('я иду по краю крыши', 0, 0.4),
      ...recEven('гори гори моя звезда', 10, 0.5),
    ]
    const { lyrics: out } = alignLyrics(lyrics, recognized, { durationSec: 40 })
    expect(sourcesByLine(out)).toEqual(['aligned', 'other'])
    const second = out.lines[2]!.words
    expect(second[0]!.start!).toBeGreaterThan(12)
    expectPlayable(out)
  })
})
