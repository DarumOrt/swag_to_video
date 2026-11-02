import { describe, expect, it } from 'vitest'
import { flattenWords, lyricsToText, parseLyricsText } from './model'

const SONG = `[Куплет 1]
Ночной трамвай везёт меня домой,
Огни плывут над тёмною рекой.

[Припев]
Гори, гори — моя звезда!
Гори, гори — моя звезда!

А потом тишина`

describe('parseLyricsText', () => {
  it('splits lines, words and sections', () => {
    const lyrics = parseLyricsText(SONG)
    expect(lyrics.language).toBe('ru')
    expect(lyrics.lines.map((l) => l.section)).toEqual([
      'Куплет 1',
      'Куплет 1',
      'Припев',
      'Припев',
      undefined,
    ])
    expect(lyrics.lines[2]!.words.map((w) => w.text)).toEqual(['Гори,', 'гори —', 'моя', 'звезда!'])
    expect(
      flattenWords(lyrics).every((r) => r.word.start === null && r.word.timingSource === null),
    ).toBe(true)
  })

  it('gives unique ids, also for repeated lines', () => {
    const lyrics = parseLyricsText(SONG)
    const lineIds = lyrics.lines.map((l) => l.id)
    const wordIds = flattenWords(lyrics).map((r) => r.word.id)
    expect(new Set(lineIds).size).toBe(lineIds.length)
    expect(new Set(wordIds).size).toBe(wordIds.length)
    expect(lineIds[3]).toBe(`${lineIds[2]}-2`)
  })

  it('keeps ids of unchanged lines when another line is edited', () => {
    const before = parseLyricsText(SONG)
    const after = parseLyricsText(SONG.replace('Огни плывут', 'Огни горят'))
    expect(after.lines[0]!.id).toBe(before.lines[0]!.id)
    expect(after.lines[1]!.id).not.toBe(before.lines[1]!.id)
    expect(after.lines[2]!.id).toBe(before.lines[2]!.id)
    expect(after.lines[4]!.words[1]!.id).toBe(before.lines[4]!.words[1]!.id)
  })

  it('handles CRLF and the explicit language option', () => {
    const lyrics = parseLyricsText('one two\r\nthree', { language: 'mixed' })
    expect(lyrics.language).toBe('mixed')
    expect(lyrics.lines).toHaveLength(2)
  })
})

describe('lyricsToText', () => {
  it('round-trips through the parser', () => {
    const lyrics = parseLyricsText(SONG)
    const again = parseLyricsText(lyricsToText(lyrics))
    expect(again).toEqual(lyrics)
  })
})
