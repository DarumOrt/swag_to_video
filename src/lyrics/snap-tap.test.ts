import { describe, expect, it } from 'vitest'
import { flattenWords, parseLyricsText, withWords } from './model'
import { lyricsFromRecognized, isUncertain } from './recognized'
import { nearestOnset, snapToOnsets } from './snap'
import { applyTaps, nextTapUnit, recordRelease, recordTap, startTapSession, undoTap } from './tap'
import { expectPlayable, rec, timesOf } from './testing'

function timed(
  text: string,
  times: Array<[number, number]>,
  source: 'aligned' | 'manual' = 'aligned',
) {
  const lyrics = parseLyricsText(text)
  const words = flattenWords(lyrics).map((r, i) => ({
    ...r.word,
    start: times[i]![0],
    end: times[i]![1],
    timingSource: source,
  }))
  return withWords(lyrics, words)
}

describe('nearestOnset', () => {
  const onsets = new Float32Array([0.5, 1.0, 2.0])
  it('finds the closest onset inside the window', () => {
    expect(nearestOnset(onsets, 0.97, 0.1)).toBeCloseTo(1.0)
    expect(nearestOnset(onsets, 1.4, 0.1)).toBeNull()
    expect(nearestOnset(onsets, 3, 1.5)).toBeCloseTo(2.0)
    expect(nearestOnset(new Float32Array(), 1, 1)).toBeNull()
  })
})

describe('snapToOnsets', () => {
  it('moves starts to onsets within the window and trims the previous word', () => {
    const lyrics = timed('раз два три', [
      [1.0, 1.5],
      [1.5, 2.0],
      [2.0, 2.5],
    ])
    const out = snapToOnsets(lyrics, new Float32Array([1.04, 1.45, 2.3]), { windowSec: 0.08 })
    expect(timesOf(out).map(([, s, e, src]) => [s, e, src])).toEqual([
      [expect.closeTo(1.04), expect.closeTo(1.45), 'snapped'],
      [expect.closeTo(1.45), 2.0, 'snapped'],
      [2.0, 2.5, 'aligned'],
    ])
    expectPlayable(out)
  })

  it('never reorders words or makes them too short', () => {
    const lyrics = timed('раз два', [
      [1.0, 1.1],
      [1.1, 1.5],
    ])
    // Only onset is just before the first word: the second word must not jump onto it.
    const out = snapToOnsets(lyrics, new Float32Array([1.02]), { windowSec: 0.1 })
    expect(out.lines[0]!.words[1]!.start).toBe(1.1)
    expectPlayable(out)
  })

  it('leaves manual timings alone', () => {
    const lyrics = timed('раз', [[1, 1.5]], 'manual')
    expect(snapToOnsets(lyrics, new Float32Array([1.03]))).toEqual(lyrics)
  })
})

describe('tap sync', () => {
  const lyrics = parseLyricsText(`Ночной трамвай
Огни плывут над рекой`)

  it('records, ignores backwards taps and undoes', () => {
    let session = startTapSession(lyrics, 'line')
    expect(nextTapUnit(session)).toBe(lyrics.lines[0]!.id)
    session = recordTap(session, 1)
    session = recordTap(session, 0.5)
    expect(session.taps).toHaveLength(1)
    session = recordTap(session, 3)
    session = recordTap(session, 9) // more taps than lines → ignored
    expect(session.taps.map((t) => t.time)).toEqual([1, 3])
    expect(nextTapUnit(session)).toBeNull()
    expect(undoTap(session).taps).toHaveLength(1)
  })

  it('line mode: first word tapped, the rest spread to the next tap', () => {
    let session = startTapSession(lyrics, 'line')
    session = recordTap(session, 1)
    session = recordTap(session, 3)
    const out = applyTaps(lyrics, session)
    const first = out.lines[0]!.words
    expect(first[0]).toMatchObject({ start: 1, timingSource: 'tap' })
    expect(first[1]!.timingSource).toBe('interpolated')
    expect(first[1]!.end).toBe(3)
    expect(out.lines[1]!.words[0]!.start).toBe(3)
    // Last line has no next tap: capped at 0.6 s per syllable (7 syllables).
    expect(out.lines[1]!.words.at(-1)!.end).toBeCloseTo(3 + 7 * 0.6)
    expectPlayable(out)
  })

  it('word mode with holds uses release as the end', () => {
    let session = startTapSession(lyrics, 'word', 2)
    session = recordTap(session, 5)
    session = recordRelease(session, 5.3)
    session = recordTap(session, 5.6)
    const out = applyTaps(lyrics, session)
    const line = out.lines[1]!.words
    expect(line[0]).toMatchObject({ start: 5, end: 5.3, timingSource: 'tap' })
    expect(line[1]).toMatchObject({ start: 5.6, timingSource: 'tap' })
    expect(line[2]!.start).toBeNull()
    expect(out.lines[0]!.words[0]!.start).toBeNull()
  })
})

describe('lyricsFromRecognized', () => {
  it('splits lines at pauses and sentence ends, keeps confidence', () => {
    const lyrics = lyricsFromRecognized(
      rec(
        [' Hey', 0, 0.3],
        [' you.', 0.35, 0.7],
        [' Come', 0.8, 1.0],
        [' closer', 1.05, 1.5, 0.3],
        [' now', 3, 3.4],
        [' ♪', 3.5, 3.6],
      ),
    )
    expect(lyrics.language).toBe('en')
    expect(lyrics.lines.map((l) => l.words.map((w) => w.text))).toEqual([
      ['Hey', 'you.'],
      ['Come', 'closer'],
      ['now'],
    ])
    const closer = lyrics.lines[1]!.words[1]!
    expect(closer).toMatchObject({ timingSource: 'whisper', confidence: 0.3 })
    expect(isUncertain(closer)).toBe(true)
    expect(isUncertain(lyrics.lines[0]!.words[0]!)).toBe(false)
    expectPlayable(lyrics)
  })
})
