import { describe, expect, it } from 'vitest'
import { createFakeTimeline } from './fakeTimeline'

describe('createFakeTimeline', () => {
  it('is deterministic for a seed', () => {
    const a = createFakeTimeline({ durationSec: 4, seed: 3 })
    const b = createFakeTimeline({ durationSec: 4, seed: 3 })
    const c = createFakeTimeline({ durationSec: 4, seed: 4 })
    expect(a).toEqual(b)
    expect(a.audio.features.spectrum.data).not.toEqual(c.audio.features.spectrum.data)
  })

  it('has consistent shapes and ranges', () => {
    const t = createFakeTimeline({ durationSec: 5, featureRate: 50, binCount: 64 })
    const f = t.audio.features
    expect(f.frameCount).toBe(250)
    expect(f.spectrum.data.length).toBe(250 * 64)
    for (const arr of [f.spectrum.data, f.rms, f.peak, f.bands.low, f.bands.mid, f.bands.high]) {
      expect(arr.every((v) => v >= 0 && v <= 1)).toBe(true)
    }
    expect(f.rms.length).toBe(250)
  })

  it('kicks on the beat in the low band', () => {
    const t = createFakeTimeline({ durationSec: 8, bpm: 120 })
    const { low } = t.audio.features.bands
    // Beat at 4.0 s (frame 240 at 60 fps) vs. the middle of that beat (4.25 s).
    expect(low[240] ?? 0).toBeGreaterThan((low[255] ?? 0) * 2)
    expect(t.audio.rhythm.beats.length).toBe(16)
    expect(t.audio.rhythm.downbeats.length).toBe(4)
  })

  it('times lyrics on beats and binds accents to existing words', () => {
    const t = createFakeTimeline({ durationSec: 20 })
    expect(t.lyrics?.lines.length).toBeGreaterThan(0)
    const ids = new Set(t.lyrics?.lines.flatMap((l) => l.words.map((w) => w.id)))
    for (const a of t.accents) expect(ids.has(a.wordId)).toBe(true)
    expect(createFakeTimeline({ durationSec: 20, withLyrics: false }).lyrics).toBeNull()
  })
})
