import { describe, expect, it } from 'vitest'
import { analyzePcm } from './analyze'
import { analyzeVocalStem, applyVocalStem } from './stem'
import { clicks, clickTimes, lcg, pcmOf, silence } from './test/synth'

const SR = 44100

/** A sung syllable: fast attack, slow release, a little pitch movement. */
function syllable(seconds: number, hz: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / SR
    phase += (2 * Math.PI * hz * (1 + 0.01 * Math.sin(2 * Math.PI * 5 * t))) / SR
    const envelope = Math.min(1, t / 0.01) * Math.min(1, (seconds - t) / 0.06)
    out[i] =
      0.3 * envelope * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase))
  }
  return out
}

/** Two phrases of syllables over a quiet noise floor (separation bleed at about -50 dBFS). */
function vocalStem() {
  const track = silence(SR, 12)
  const random = lcg(5)
  for (let i = 0; i < track.length; i++) track[i] = 0.003 * (random() * 2 - 1)
  const starts = [1, 1.4, 1.8, 2.3, 2.7, 7, 7.5, 7.9, 8.4]
  starts.forEach((start, k) => {
    const s = syllable(0.3, 220 + 30 * (k % 3))
    const offset = Math.round(start * SR)
    for (let i = 0; i < s.length; i++) track[offset + i] = track[offset + i]! + s[i]!
  })
  return { track, starts }
}

describe('analyzeVocalStem', () => {
  it('finds phrases and syllable starts on an isolated vocal', () => {
    const { track, starts } = vocalStem()
    const { vocalActivity, vocalOnsets } = analyzeVocalStem(pcmOf(SR, track, track))

    expect(vocalActivity.length).toBe(2)
    expect(vocalActivity[0]!.start).toBeGreaterThan(0.6)
    expect(vocalActivity[0]!.start).toBeLessThan(1)
    expect(vocalActivity[0]!.end).toBeGreaterThan(3)
    expect(vocalActivity[0]!.end).toBeLessThan(3.5)
    expect(vocalActivity[1]!.start).toBeGreaterThan(6.6)
    expect(vocalActivity[1]!.end).toBeLessThan(9.2)

    expect(vocalOnsets.length).toBe(starts.length)
    starts.forEach((start, k) => expect(Math.abs(vocalOnsets[k]! - start)).toBeLessThan(0.03))
  })

  it('finds nothing in bleed alone', () => {
    const random = lcg(9)
    const bleed = silence(SR, 5).map(() => 0.003 * (random() * 2 - 1))
    expect(analyzeVocalStem(pcmOf(SR, bleed))).toEqual({
      vocalOnsets: new Float32Array(0),
      vocalActivity: [],
    })
    expect(analyzeVocalStem(pcmOf(SR, silence(SR, 2)))).toEqual({
      vocalOnsets: new Float32Array(0),
      vocalActivity: [],
    })
  })
})

describe('applyVocalStem', () => {
  it('replaces only the vocal cues, without touching the input', () => {
    const seconds = 12
    const drums = clicks(SR, seconds, clickTimes(120, seconds))
    const { track: vocal } = vocalStem()
    const mix = drums.map((v, i) => v + vocal[i]!)
    const analysis = analyzePcm(pcmOf(SR, mix, mix))
    const before = structuredClone(analysis)

    const updated = applyVocalStem(analysis, pcmOf(SR, vocal))
    expect(analysis).toEqual(before)
    expect(updated.features).toBe(analysis.features)
    expect(updated.rhythm.beats).toBe(analysis.rhythm.beats)
    expect(updated.rhythm.onsets).toBe(analysis.rhythm.onsets)
    expect(updated.vocalActivity.length).toBe(2)
    expect(updated.rhythm.vocalOnsets.length).toBe(9)
  })

  it('is deterministic', () => {
    const { track } = vocalStem()
    expect(analyzeVocalStem(pcmOf(SR, track))).toEqual(analyzeVocalStem(pcmOf(SR, track.slice())))
  })
})
