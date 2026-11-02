import { describe, expect, it } from 'vitest'
import { editWord, retimeFrom, shiftLine } from './edit'
import { flattenWords, parseLyricsText, withWords } from './model'
import { applyTaps, recordTap } from './tap'
import { expectPlayable, timesOf } from './testing'

// Two lines, words at 1.0, 1.5, 2.0 | 4.0, 4.5 (each 0.4 s long), all 'aligned'.
function sample() {
  const lyrics = parseLyricsText('раз два три\nчетыре пять')
  const starts = [1, 1.5, 2, 4, 4.5]
  const words = flattenWords(lyrics).map((r, i) => ({
    ...r.word,
    start: starts[i]!,
    end: starts[i]! + 0.4,
    confidence: 0.9,
    timingSource: 'aligned' as const,
  }))
  return withWords(lyrics, words)
}
const idOf = (lyrics: ReturnType<typeof sample>, i: number) => flattenWords(lyrics)[i]!.word.id

describe('editWord', () => {
  it('changes timing, marks it manual and trims the overlapped neighbour', () => {
    const lyrics = sample()
    const out = editWord(lyrics, idOf(lyrics, 1), { start: 1.3, end: 1.8 })
    expect(timesOf(out).slice(0, 3)).toEqual([
      ['раз', 1, 1.3, 'aligned'],
      ['два', 1.3, 1.8, 'manual'],
      ['три', 2, 2.4, 'aligned'],
    ])
    expect(flattenWords(out)[1]!.word.confidence).toBeNull()
    expectPlayable(out)
  })

  it('pushes the next start forward when the word grows into it', () => {
    const lyrics = sample()
    const out = editWord(lyrics, idOf(lyrics, 1), { end: 2.2 })
    expect(timesOf(out)[2]).toEqual(['три', 2.2, 2.4, 'aligned'])
    expectPlayable(out)
  })

  it('never reorders words or squeezes neighbours below the minimum', () => {
    const lyrics = sample()
    const out = editWord(lyrics, idOf(lyrics, 1), { start: 0.2, end: 9 })
    const [, two] = flattenWords(out).map((r) => r.word)
    expect(two!.start).toBeCloseTo(1.06)
    expect(two!.end).toBeCloseTo(2.34)
    expectPlayable(out)
  })

  it('edits text only without touching timing', () => {
    const lyrics = sample()
    const out = editWord(lyrics, idOf(lyrics, 0), { text: ' Раз, ' })
    expect(timesOf(out)[0]).toEqual(['Раз,', 1, 1.4, 'aligned'])
    expect(flattenWords(out)[0]!.word.id).toBe(idOf(lyrics, 0))
  })

  it('times an untimed word from a single edge', () => {
    const lyrics = parseLyricsText('привет')
    const out = editWord(lyrics, idOf(lyrics, 0), { start: 3 })
    expect(timesOf(out)[0]).toEqual(['привет', 3, expect.closeTo(3.44), 'manual'])
  })

  it('returns the same lyrics for an unknown id', () => {
    const lyrics = sample()
    expect(editWord(lyrics, 'nope', { start: 1 })).toBe(lyrics)
  })
})

describe('shiftLine', () => {
  it('moves all words of the line and marks them manual', () => {
    const lyrics = sample()
    const out = shiftLine(lyrics, lyrics.lines[1]!.id, -0.5)
    expect(timesOf(out).slice(3)).toEqual([
      ['четыре', 3.5, expect.closeTo(3.9), 'manual'],
      ['пять', 4, expect.closeTo(4.4), 'manual'],
    ])
    expect(timesOf(out)[2]).toEqual(['три', 2, 2.4, 'aligned'])
  })

  it('clamps the shift and trims the neighbour it reaches', () => {
    const lyrics = sample()
    const out = shiftLine(lyrics, lyrics.lines[1]!.id, -10)
    expect(flattenWords(out)[3]!.word.start).toBeCloseTo(2.06)
    expect(flattenWords(out)[2]!.word.end).toBeCloseTo(2.06)
    expectPlayable(out)
    const first = shiftLine(lyrics, lyrics.lines[0]!.id, -10)
    expect(flattenWords(first)[0]!.word.start).toBe(0)
  })
})

describe('retimeFrom', () => {
  it('clears from the word on and starts a word session there', () => {
    const lyrics = sample()
    const { lyrics: cleared, session, resumeFromSec } = retimeFrom(lyrics, idOf(lyrics, 2))
    expect(timesOf(cleared).map(([, s]) => s)).toEqual([1, 1.5, null, null, null])
    expect(session.unitIds[0]).toBe(idOf(lyrics, 2))
    expect(resumeFromSec).toBeCloseTo(1.9)
    const tapped = applyTaps(cleared, recordTap(session, 2.1))
    expect(timesOf(tapped)[2]).toEqual(['три', 2.1, expect.closeTo(2.7), 'tap'])
  })

  it('line mode restarts from the start of the word’s line', () => {
    const lyrics = sample()
    const { lyrics: cleared, session, resumeFromSec } = retimeFrom(lyrics, idOf(lyrics, 4), 'line')
    expect(timesOf(cleared).map(([, s]) => s)).toEqual([1, 1.5, 2, null, null])
    expect(session.unitIds).toEqual([lyrics.lines[1]!.id])
    expect(resumeFromSec).toBeCloseTo(2.4)
  })
})
