import { describe, expect, it } from 'vitest'
import { isKnownHallucination, maxRepeatRun, trimRepetitions } from './filters'
import { buildWords, decodeWindow } from './segments'

const EOT = 50257
const TS = 50364 // <|0.00|>
const ts = (sec: number) => TS + Math.round(sec / 0.02)

describe('decodeWindow', () => {
  it('splits segments and consumes the whole window on a single timestamp ending', () => {
    const tokens = [ts(0), 1, 2, ts(2), ts(2.5), 3, ts(4), EOT]
    const out = decodeWindow({ tokens, eotId: EOT, timestampBegin: TS, windowSec: 30 })
    expect(out.segments).toEqual([
      { start: 0, end: 2, tokenIndices: [1, 2] },
      { start: 2.5, end: 4, tokenIndices: [5] },
    ])
    expect(out.advanceSec).toBe(30)
    expect(out.truncated).toBe(false)
  })

  it('drops an unfinished trailing segment and seeks to its start', () => {
    const tokens = [ts(0), 1, ts(10), ts(11), 2, 3, EOT]
    const out = decodeWindow({ tokens, eotId: EOT, timestampBegin: TS, windowSec: 30 })
    expect(out.segments).toEqual([{ start: 0, end: 10, tokenIndices: [1] }])
    expect(out.advanceSec).toBeCloseTo(10)
  })

  it('closes text without an end timestamp at the window end', () => {
    const tokens = [ts(1), 1, 2, EOT]
    const out = decodeWindow({ tokens, eotId: EOT, timestampBegin: TS, windowSec: 20 })
    expect(out.segments).toEqual([{ start: 1, end: 20, tokenIndices: [1, 2] }])
    expect(out.advanceSec).toBe(20)
  })

  it('flags truncated output and never returns a zero advance', () => {
    const tokens = [ts(0), 5, 5, 5, 5]
    const out = decodeWindow({ tokens, eotId: EOT, timestampBegin: TS, windowSec: 30 })
    expect(out.truncated).toBe(true)
    expect(out.advanceSec).toBe(30)

    const empty = decodeWindow({
      tokens: [ts(0), ts(0), EOT],
      eotId: EOT,
      timestampBegin: TS,
      windowSec: 30,
    })
    expect(empty.advanceSec).toBeGreaterThan(0)
  })
})

describe('buildWords', () => {
  it('uses the next token start as word end and averages token probabilities', () => {
    const times = [0, 1.0, 1.2, 1.5, 2.0]
    const probs = [NaN, 0.9, 0.5, 0.8, NaN]
    const words = buildWords(
      [
        { text: ' hel', indices: [1, 2] },
        { text: ' lo', indices: [3] },
      ],
      times,
      probs,
      10,
      2.5,
    )
    expect(words).toEqual([
      { text: 'hel', start: 11, end: 11.5, confidence: 0.7 },
      { text: 'lo', start: 11.5, end: 12, confidence: 0.8 },
    ])
  })

  it('falls back to the segment end for the last token', () => {
    const words = buildWords([{ text: ' end', indices: [0] }], [3], [NaN], 0, 3.4)
    expect(words).toEqual([{ text: 'end', start: 3, end: 3.4, confidence: null }])
  })
})

describe('filters', () => {
  it('detects subtitle-credit hallucinations', () => {
    expect(isKnownHallucination('Субтитры сделал DimaTorzok')).toBe(true)
    expect(isKnownHallucination(' Продолжение следует...')).toBe(true)
    expect(isKnownHallucination('Thanks for watching!')).toBe(true)
    expect(isKnownHallucination('я иду домой')).toBe(false)
  })

  it('measures repeated n-gram runs', () => {
    expect(maxRepeatRun(['a', 'b', 'c'])).toBe(1)
    expect(maxRepeatRun(['na', 'na', 'na', 'hey'])).toBe(3)
    expect(maxRepeatRun(['go', 'home', 'go', 'home', 'go', 'home'])).toBe(3)
    expect(maxRepeatRun([])).toBe(0)
  })
})

describe('trimRepetitions', () => {
  it('keeps short legit repeats and cuts long loops', () => {
    const chorus = ['baby', 'you', 'know', 'baby', 'you', 'know']
    expect(trimRepetitions(chorus, 4)).toEqual([0, 1, 2, 3, 4, 5])
    const loop = ['я', 'включаю', ...Array<string>(20).fill('субтитры')]
    expect(trimRepetitions(loop, 4)).toEqual([0, 1, 2, 3, 4, 5])
    expect(isKnownHallucination('Субтитры субтитры')).toBe(true)
    expect(isKnownHallucination('Музыка.')).toBe(true)
    expect(isKnownHallucination('амара точка орг')).toBe(false)
  })
})
