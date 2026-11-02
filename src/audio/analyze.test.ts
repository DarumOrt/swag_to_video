import { describe, expect, it } from 'vitest'
import { analyzePcm, SPECTRUM_BINS, SPECTRUM_MIN_HZ } from './analyze'
import { FFT } from './fft'
import { kWeightingFilters, LUFS_FLOOR } from './loudness'
import { clicks, clickTimes, lcg, pcmOf, silence, sine } from './test/synth'

const SR = 48000

function maxOf(array: Float32Array): number {
  let max = -Infinity
  for (const v of array) max = Math.max(max, v)
  return max
}

function nearest(times: Float32Array, t: number): number {
  let best = Infinity
  for (const v of times) if (Math.abs(v - t) < Math.abs(best - t)) best = v
  return best
}

describe('FFT', () => {
  it('puts a bin-centered cosine into its bin', () => {
    const n = 64
    const fft = new FFT(n)
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n)
    fft.transform(re, im)
    expect(re[5]).toBeCloseTo(n / 2, 6)
    expect(re[n - 5]).toBeCloseTo(n / 2, 6)
    expect(Math.hypot(re[6]!, im[6]!)).toBeLessThan(1e-9)
  })
})

describe('spectrum', () => {
  for (const sampleRate of [44100, 48000]) {
    it(`peaks at the bin of a 1 kHz sine (${sampleRate} Hz)`, () => {
      const tone = sine(sampleRate, 2, 1000, 0.5)
      const { features } = analyzePcm(pcmOf(sampleRate, tone, tone))
      const { binCount, minHz, maxHz, data } = features.spectrum
      const expected = Math.floor((binCount * Math.log(1000 / minHz)) / Math.log(maxHz / minHz))
      const frame = Math.floor(features.frameCount / 2)
      const row = data.subarray(frame * binCount, (frame + 1) * binCount)
      const argmax = row.indexOf(maxOf(row))
      expect(Math.abs(argmax - expected)).toBeLessThanOrEqual(1)
      // -6 dBFS on a 90 dB scale.
      expect(row[argmax]).toBeCloseTo(1 - 6 / 90, 1)
      expect(row[0]).toBeLessThan(0.2)
    })
  }

  it('uses the configured bin layout', () => {
    const { features } = analyzePcm(pcmOf(SR, sine(SR, 0.5, 440)))
    expect(features.spectrum.binCount).toBe(SPECTRUM_BINS)
    expect(features.spectrum.minHz).toBe(SPECTRUM_MIN_HZ)
    expect(features.spectrum.data.length).toBe(features.frameCount * SPECTRUM_BINS)
    expect(features.frameCount).toBe(30)
  })
})

describe('levels', () => {
  it('reports a full-scale sine correctly', () => {
    const tone = sine(SR, 4, 1000)
    const { features } = analyzePcm(pcmOf(SR, tone, tone))
    const mid = Math.floor(features.frameCount * 0.75)
    expect(features.rms[mid]).toBeCloseTo(Math.SQRT1_2, 2)
    expect(features.peak[mid]).toBeCloseTo(1, 2)
    // Stereo, 0 dBFS 1 kHz sine in both channels ≈ 0 LUFS (BS.1770).
    expect(features.lufsShortTerm[mid]).toBeCloseTo(0, 0)
    expect(features.stereo.correlation[mid]).toBeCloseTo(1, 3)
    expect(features.stereo.width[mid]).toBeCloseTo(0, 3)
    expect(features.bands.mid[mid]).toBeCloseTo(1, 2)
    expect(features.bands.low[mid]!).toBeLessThan(0.5)
  })

  it('measures -3 LUFS for a 0 dBFS sine in one channel', () => {
    const { features } = analyzePcm(pcmOf(SR, sine(SR, 4, 1000)))
    expect(features.lufsShortTerm[features.frameCount - 1]).toBeCloseTo(-3.01, 1)
  })

  it('sees inverted channels as anti-correlated and wide', () => {
    const tone = sine(SR, 1, 300)
    const inverted = tone.map((v) => -v)
    const { features } = analyzePcm(pcmOf(SR, tone, inverted))
    expect(features.stereo.correlation[30]).toBeCloseTo(-1, 3)
    expect(features.stereo.width[30]).toBeCloseTo(1, 3)
  })

  it('reads silence as zero', () => {
    const quiet = silence(SR, 3)
    const a = analyzePcm(pcmOf(SR, quiet, quiet))
    const f = a.features
    for (const array of [
      f.spectrum.data,
      f.rms,
      f.peak,
      f.bands.low,
      f.bands.mid,
      f.bands.high,
      f.stereo.correlation,
      f.stereo.width,
    ]) {
      expect(maxOf(array)).toBe(0)
    }
    expect(maxOf(f.lufsShortTerm)).toBe(LUFS_FLOOR)
    expect(a.rhythm.bpm).toBeNull()
    expect(a.rhythm.beats.length).toBe(0)
    expect(a.rhythm.onsets.length).toBe(0)
    expect(a.vocalActivity).toEqual([])
  })

  it('handles empty input', () => {
    const a = analyzePcm(pcmOf(SR, new Float32Array(0)))
    expect(a.features.frameCount).toBe(0)
    expect(a.rhythm.bpm).toBeNull()
  })
})

describe('K-weighting', () => {
  it('matches the BS.1770 coefficients at 48 kHz', () => {
    const [shelf, highPass] = kWeightingFilters(48000)
    expect(shelf.b0).toBeCloseTo(1.53512485958697, 10)
    expect(shelf.b1).toBeCloseTo(-2.69169618940638, 10)
    expect(shelf.b2).toBeCloseTo(1.19839281085285, 10)
    expect(shelf.a1).toBeCloseTo(-1.69065929318241, 10)
    expect(shelf.a2).toBeCloseTo(0.73248077421585, 10)
    expect(highPass.a1).toBeCloseTo(-1.99004745483398, 10)
    expect(highPass.a2).toBeCloseTo(0.99007225036621, 10)
  })
})

describe('rhythm', () => {
  for (const bpm of [120, 128, 95]) {
    it(`finds ${bpm} BPM and its beats in a click track`, () => {
      const seconds = 20
      const times = clickTimes(bpm, seconds, 0.5)
      const track = clicks(SR, seconds, times)
      const { rhythm } = analyzePcm(pcmOf(SR, track, track))
      expect(rhythm.bpm).not.toBeNull()
      expect(Math.abs(rhythm.bpm! - bpm)).toBeLessThan(0.5)

      // Every click is an onset, within 20 ms, and there are no extras.
      expect(rhythm.onsets.length).toBe(times.length)
      for (const t of times) expect(Math.abs(nearest(rhythm.onsets, t) - t)).toBeLessThan(0.02)

      expect(rhythm.beats.length).toBeGreaterThanOrEqual(times.length - 2)
      for (const beat of rhythm.beats) {
        let best = Infinity
        for (const t of times) best = Math.min(best, Math.abs(t - beat))
        expect(best).toBeLessThan(0.025)
      }
      expect(rhythm.downbeats.length).toBeGreaterThan(0)
      for (const d of rhythm.downbeats) expect(rhythm.beats).toContain(d)
    })
  }

  it('finds vocal-band onsets only for vocal-band events', () => {
    const seconds = 6
    // Fast attack, slow release: an abrupt stop would itself be a broadband onset.
    const burst = (hz: number) => {
      const seconds = 0.4
      const tone = sine(SR, seconds, hz, 0.5)
      for (let i = 0; i < tone.length; i++) {
        const t = i / SR
        const fadeOut = Math.min(1, (seconds - t) / 0.1)
        tone[i] = tone[i]! * Math.min(1, t / 0.005) * Math.exp(-t / 0.08) * fadeOut
      }
      return tone
    }
    const track = silence(SR, seconds)
    // 1 kHz tone bursts at 1, 3, 5 s: in the vocal band.
    for (const start of [1, 3, 5]) track.set(burst(1000), Math.round(start * SR))
    const { rhythm } = analyzePcm(pcmOf(SR, track))
    expect(rhythm.vocalOnsets.length).toBe(3)
    for (const t of [1, 3, 5])
      expect(Math.abs(nearest(rhythm.vocalOnsets, t) - t)).toBeLessThan(0.03)

    // 9 kHz bursts ("hats"): full-band onsets, nothing in the vocal band.
    const hats = silence(SR, seconds)
    for (const start of [1, 3, 5]) hats.set(burst(9000), Math.round(start * SR))
    const high = analyzePcm(pcmOf(SR, hats)).rhythm
    expect(high.onsets.length).toBe(3)
    expect(high.vocalOnsets.length).toBe(0)
  })
})

describe('vocal activity', () => {
  it('marks a vocal-band tone between silences', () => {
    const track = silence(SR, 10)
    track.set(sine(SR, 4, 800, 0.3), 3 * SR)
    const { vocalActivity } = analyzePcm(pcmOf(SR, track))
    expect(vocalActivity.length).toBe(1)
    expect(vocalActivity[0]!.start).toBeGreaterThan(2.4)
    expect(vocalActivity[0]!.start).toBeLessThan(3)
    expect(vocalActivity[0]!.end).toBeGreaterThan(7)
    expect(vocalActivity[0]!.end).toBeLessThan(7.6)
  })
})

describe('determinism', () => {
  it('produces identical numbers on repeated runs', () => {
    const random = lcg(7)
    const seconds = 8
    const beat = clicks(SR, seconds, clickTimes(124, seconds))
    const left = sine(SR, seconds, 220, 0.2)
    const right = sine(SR, seconds, 330, 0.2)
    for (let i = 0; i < left.length; i++) {
      const noise = 0.05 * (random() * 2 - 1)
      left[i] = left[i]! + beat[i]! + noise
      right[i] = right[i]! + beat[i]! - noise
    }
    const a = analyzePcm(pcmOf(SR, left, right))
    const b = analyzePcm(pcmOf(SR, left.slice(), right.slice()))
    expect(b).toEqual(a)
  })
})
