import { describe, expect, it } from 'vitest'
import { flattenWords, parseLyricsText } from '@/lyrics'
import type { Lyrics } from '@/shared'
import {
  carryUserTimings,
  countWords,
  deleteWord,
  editWord,
  indexTimedWords,
  wordAt,
} from './lyricsEdit'

const TEXT = '[Куплет]\nсвет в окне горит\nтихо спит район'

function timed(lyrics: Lyrics): Lyrics {
  let t = 0
  return {
    ...lyrics,
    lines: lyrics.lines.map((line) => ({
      ...line,
      words: line.words.map((word) => {
        const start = t
        t += 0.5
        return { ...word, start, end: start + 0.4, confidence: 0.9, timingSource: 'whisper' }
      }),
    })),
  }
}

const words = (lyrics: Lyrics) => flattenWords(lyrics).map((ref) => ref.word)

describe('editWord', () => {
  it('marks edited words as manual', () => {
    const lyrics = timed(parseLyricsText(TEXT))
    const id = words(lyrics)[1]!.id
    const edited = words(editWord(lyrics, id, { text: 'во', start: 0.6 }))[1]!
    expect(edited).toMatchObject({ text: 'во', start: 0.6, end: 0.9, timingSource: 'manual' })
    expect(edited.confidence).toBeNull()
  })

  it('clears timing when the start is removed', () => {
    const lyrics = timed(parseLyricsText(TEXT))
    const id = words(lyrics)[0]!.id
    const edited = words(editWord(lyrics, id, { start: null }))[0]!
    expect(edited).toMatchObject({ start: null, end: null, timingSource: null })
  })
})

describe('deleteWord', () => {
  it('drops empty lines', () => {
    const lyrics = parseLyricsText('один\nдва три')
    const only = lyrics.lines[0]!.words[0]!.id
    expect(deleteWord(lyrics, only).lines).toHaveLength(1)
  })
})

describe('carryUserTimings', () => {
  it('keeps manual timings of unchanged lines after a re-paste', () => {
    const before = timed(parseLyricsText(TEXT))
    const id = words(before)[4]!.id
    const edited = editWord(before, id, { start: 9, end: 9.5 })
    const repasted = parseLyricsText(`${TEXT}\nновая строка`)
    const carried = words(carryUserTimings(edited, repasted))
    expect(carried.find((word) => word.id === id)).toMatchObject({
      start: 9,
      timingSource: 'manual',
    })
    expect(carried.filter((word) => word.start !== null)).toHaveLength(1)
  })
})

describe('wordAt', () => {
  it('finds the word under the playhead', () => {
    const lyrics = timed(parseLyricsText(TEXT))
    const index = indexTimedWords(lyrics)
    expect(wordAt(index, 0.1)).toBe(words(lyrics)[0]!.id)
    expect(wordAt(index, 0.45)).toBeNull()
    expect(wordAt(index, 1.2)).toBe(words(lyrics)[2]!.id)
    expect(wordAt(index, -1)).toBeNull()
  })

  it('counts timed words', () => {
    expect(countWords(parseLyricsText(TEXT))).toEqual({ total: 7, timed: 0 })
  })
})
