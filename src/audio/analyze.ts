import type { AudioAnalysis, FrameFeatures } from '@/shared'
import { FFT, hannWindow } from './fft'
import { kWeightedSegmentEnergy, shortTermLoudness } from './loudness'
import { estimateTempo, onsetScale, pickDownbeats, pickOnsets, trackBeats } from './rhythm'
import type { DecodedAudio } from './types'
import { clamp01, percentile, smoothAttackRelease } from './util'
import { detectVocalActivity } from './vocal'

/*
 * Frame i describes the audio around its center time (i + 0.5) / rate: spectrum, RMS and stereo
 * windows are centered there (zero latency, so visuals hit on time). Peak covers exactly the
 * frame's own samples, short-term LUFS the trailing 3 s like a meter.
 */

export const FEATURE_RATE = 60
export const SPECTRUM_BINS = 96
export const SPECTRUM_MIN_HZ = 30
export const SPECTRUM_MAX_HZ = 16000
/** Spectrum values map [SPECTRUM_DB_FLOOR, 0] dBFS (full-scale sine = 0 dB) to 0..1. */
export const SPECTRUM_DB_FLOOR = -90

export const BAND_EDGES_HZ = { low: [20, 200], mid: [200, 4000], high: [4000, 16000] } as const
/** Bands are normalized per track: 1 = the track's 99th percentile, 0 = that minus this many dB. */
const BAND_RANGE_DB = 36
/** Reference level is never taken below this, so near-silent tracks stay near 0. */
const BAND_REF_MIN_DB = -60

/** Window for RMS and stereo measurements. */
const LEVEL_WINDOW_SEC = 0.05

/** Per-frame smoothing coefficients (at 60 fps): fast attack, slower release. */
const SPECTRUM_ATTACK = 0.8
const SPECTRUM_RELEASE = 0.25
const BAND_ATTACK = 1
const BAND_RELEASE = 0.3

/** Log compression for spectral flux: log(1 + FLUX_GAMMA * amplitude). */
const FLUX_GAMMA = 1000
/** Vocal-band onsets must be significant relative to this share of the full-band onset scale. */
const VOCAL_ONSET_RELATIVE_SCALE = 0.25

export interface AnalyzePcmOptions {
  rate?: number
  /** Called with 0..1 during the frame loop and once more with 1 at the end. */
  onProgress?: (fraction: number) => void
}

/** FFT size: smallest power of two covering ~40 ms (2048 at 44.1/48 kHz). */
export function fftSizeFor(sampleRate: number): number {
  let size = 256
  while (size < sampleRate * 0.04) size *= 2
  return size
}

/** FFT bin range [from, to) covering [loHz, hiHz), clamped to the spectrum. */
function binRange(loHz: number, hiHz: number, sampleRate: number, fftSize: number) {
  const half = fftSize / 2
  const from = Math.min(half, Math.max(1, Math.ceil((loHz * fftSize) / sampleRate)))
  const to = Math.min(half + 1, Math.max(from, Math.ceil((hiHz * fftSize) / sampleRate)))
  return { from, to }
}

/**
 * Log-frequency bin j aggregates FFT bins in [edge j, edge j+1) by max amplitude; bins narrower
 * than the FFT resolution interpolate at their center frequency instead.
 */
interface LogBin {
  from: number
  to: number
  /** Interpolation fallback when from === to. */
  index: number
  frac: number
}

function logBins(
  binCount: number,
  minHz: number,
  maxHz: number,
  sampleRate: number,
  fftSize: number,
): LogBin[] {
  const hzPerBin = sampleRate / fftSize
  const ratio = maxHz / minHz
  const bins: LogBin[] = []
  for (let j = 0; j < binCount; j++) {
    const lo = minHz * Math.pow(ratio, j / binCount)
    const hi = minHz * Math.pow(ratio, (j + 1) / binCount)
    const center = minHz * Math.pow(ratio, (j + 0.5) / binCount)
    const from = Math.ceil(lo / hzPerBin)
    const to = Math.ceil(hi / hzPerBin)
    const position = center / hzPerBin
    const index = Math.floor(position)
    bins.push({ from, to: Math.min(to, fftSize / 2 + 1), index, frac: position - index })
  }
  return bins
}

/** Pure, deterministic analysis of decoded PCM. Runs in the worker; also usable directly. */
export function analyzePcm(pcm: DecodedAudio, options: AnalyzePcmOptions = {}): AudioAnalysis {
  const rate = options.rate ?? FEATURE_RATE
  const onProgress = options.onProgress
  const { sampleRate } = pcm
  const left = pcm.channels[0] ?? new Float32Array(0)
  const right = pcm.channels[1] ?? left
  const length = left.length
  const durationSec = length / sampleRate
  const frameCount = Math.ceil((length * rate) / sampleRate)
  const hop = sampleRate / rate

  const fftSize = fftSizeFor(sampleRate)
  const half = fftSize / 2
  const fft = new FFT(fftSize)
  const window = hannWindow(fftSize)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  const amplitude = new Float64Array(half + 1)
  const logAmplitude = new Float64Array(half + 1)
  const prevLogAmplitude = new Float64Array(half + 1)
  // |X| of a full-scale sine under a Hann window is N/4.
  const amplitudeScale = 4 / fftSize
  // Sum of one-sided |X|^2 of a full-scale sine is 3N^2/32.
  const powerScale = 32 / (3 * fftSize * fftSize)

  const maxHz = Math.min(SPECTRUM_MAX_HZ, sampleRate / 2)
  const bins = logBins(SPECTRUM_BINS, SPECTRUM_MIN_HZ, maxHz, sampleRate, fftSize)
  const lowRange = binRange(BAND_EDGES_HZ.low[0], BAND_EDGES_HZ.low[1], sampleRate, fftSize)
  const midRange = binRange(BAND_EDGES_HZ.mid[0], BAND_EDGES_HZ.mid[1], sampleRate, fftSize)
  const highRange = binRange(BAND_EDGES_HZ.high[0], BAND_EDGES_HZ.high[1], sampleRate, fftSize)
  const fluxRange = binRange(SPECTRUM_MIN_HZ, maxHz, sampleRate, fftSize)

  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS)
  const rms = new Float32Array(frameCount)
  const peak = new Float32Array(frameCount)
  const correlation = new Float32Array(frameCount)
  const width = new Float32Array(frameCount)
  const lowPower = new Float64Array(frameCount)
  const midPower = new Float64Array(frameCount)
  const highPower = new Float64Array(frameCount)
  const flux = new Float32Array(frameCount)
  const vocalFlux = new Float32Array(frameCount)

  const levelHalf = Math.max(1, Math.round((LEVEL_WINDOW_SEC * sampleRate) / 2))
  const progressStep = Math.max(1, Math.floor(frameCount / 50))

  for (let i = 0; i < frameCount; i++) {
    const center = Math.round((i + 0.5) * hop)

    // Spectrum of the mid (L+R)/2 signal.
    const start = center - half
    for (let k = 0; k < fftSize; k++) {
      const s = start + k
      re[k] = s >= 0 && s < length ? 0.5 * (left[s]! + right[s]!) * window[k]! : 0
      im[k] = 0
    }
    fft.transform(re, im)
    for (let k = 0; k <= half; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!
      re[k] = p
      const a = Math.sqrt(p) * amplitudeScale
      amplitude[k] = a
      logAmplitude[k] = Math.log(1 + FLUX_GAMMA * a)
    }

    const row = i * SPECTRUM_BINS
    for (let j = 0; j < SPECTRUM_BINS; j++) {
      const bin = bins[j]!
      let a = 0
      if (bin.to > bin.from) {
        for (let k = bin.from; k < bin.to; k++) a = Math.max(a, amplitude[k]!)
      } else {
        const a0 = amplitude[bin.index] ?? 0
        const a1 = amplitude[bin.index + 1] ?? 0
        a = a0 + (a1 - a0) * bin.frac
      }
      const db = a > 0 ? 20 * Math.log10(a) : -Infinity
      spectrum[row + j] = clamp01((db - SPECTRUM_DB_FLOOR) / -SPECTRUM_DB_FLOOR)
    }

    let low = 0
    for (let k = lowRange.from; k < lowRange.to; k++) low += re[k]!
    let mid = 0
    for (let k = midRange.from; k < midRange.to; k++) mid += re[k]!
    let high = 0
    for (let k = highRange.from; k < highRange.to; k++) high += re[k]!
    lowPower[i] = low * powerScale
    midPower[i] = mid * powerScale
    highPower[i] = high * powerScale

    let f = 0
    let vf = 0
    for (let k = fluxRange.from; k < fluxRange.to; k++) {
      const d = logAmplitude[k]! - prevLogAmplitude[k]!
      if (d > 0) {
        f += d
        if (k >= midRange.from && k < midRange.to) vf += d
      }
    }
    flux[i] = f
    vocalFlux[i] = vf
    prevLogAmplitude.set(logAmplitude)

    // Levels and stereo image over a short centered window.
    let sumL = 0
    let sumR = 0
    let sumLR = 0
    const from = Math.max(0, center - levelHalf)
    const to = Math.min(length, center + levelHalf)
    for (let s = from; s < to; s++) {
      const l = left[s]!
      const r = right[s]!
      sumL += l * l
      sumR += r * r
      sumLR += l * r
    }
    const energy = sumL + sumR
    rms[i] = Math.sqrt(energy / (4 * levelHalf))
    if (energy / (4 * levelHalf) > 1e-12) {
      correlation[i] = Math.max(-1, Math.min(1, sumLR / Math.sqrt(sumL * sumR || 1)))
      width[i] = clamp01(0.5 - sumLR / energy)
    }

    let p = 0
    const segmentEnd = Math.min(length, Math.floor((i + 1) * hop))
    for (let s = Math.floor(i * hop); s < segmentEnd; s++) {
      p = Math.max(p, Math.abs(left[s]!), Math.abs(right[s]!))
    }
    peak[i] = Math.min(1, p)

    if (onProgress && i % progressStep === 0) onProgress((0.9 * i) / frameCount)
  }

  smoothAttackRelease(spectrum, SPECTRUM_ATTACK, SPECTRUM_RELEASE, SPECTRUM_BINS)

  const loudnessChannels = pcm.channels.length >= 2 ? [left, right] : [left]
  const lufsShortTerm = shortTermLoudness(
    kWeightedSegmentEnergy(loudnessChannels, sampleRate, rate, frameCount),
    sampleRate,
    rate,
  )

  // Frame position -> seconds. Flux peaks a little before a transient reaches the window center
  // (the Hann slope is steepest at a quarter window), so shift by fftSize / 8.
  const onsetLag = fftSize / 8 / sampleRate
  const frameTime = (position: number) =>
    Math.min(durationSec, Math.max(0, (position + 0.5) / rate + onsetLag))
  const timeToFrame = (time: number) =>
    Math.min(frameCount - 1, Math.max(0, Math.floor(time * rate)))

  const onsets = pickOnsets(flux, rate, frameTime)
  const vocalOnsets = pickOnsets(
    vocalFlux,
    rate,
    frameTime,
    VOCAL_ONSET_RELATIVE_SCALE * onsetScale(flux),
  )
  const tempo = estimateTempo(flux, rate)
  const beats = tempo ? trackBeats(flux, tempo.period, frameTime) : new Float32Array(0)
  const downbeats = pickDownbeats(beats, lowPower, timeToFrame)

  const features: FrameFeatures = {
    rate,
    frameCount,
    spectrum: { binCount: SPECTRUM_BINS, minHz: SPECTRUM_MIN_HZ, maxHz, data: spectrum },
    rms,
    peak,
    lufsShortTerm,
    bands: {
      low: normalizeBand(lowPower),
      mid: normalizeBand(midPower),
      high: normalizeBand(highPower),
    },
    stereo: { correlation, width },
  }

  const analysis: AudioAnalysis = {
    durationSec,
    sampleRate,
    channelCount: pcm.channels.length,
    features,
    rhythm: {
      bpm: tempo && beats.length > 0 ? Math.round(tempo.bpm * 100) / 100 : null,
      beats,
      downbeats,
      onsets,
      vocalOnsets,
    },
    vocalActivity: detectVocalActivity(midPower, rate, durationSec),
  }
  onProgress?.(1)
  return analysis
}

function normalizeBand(power: Float64Array): Float32Array {
  const out = new Float32Array(power.length)
  const db = new Float64Array(power.length)
  for (let i = 0; i < power.length; i++) {
    const p = power[i]!
    db[i] = p > 0 ? 10 * Math.log10(p) : -Infinity
  }
  const ref = percentile(db, 0.99)
  if (!Number.isFinite(ref)) return out
  const top = Math.max(ref, BAND_REF_MIN_DB)
  for (let i = 0; i < power.length; i++) {
    out[i] = clamp01((db[i]! - (top - BAND_RANGE_DB)) / BAND_RANGE_DB)
  }
  smoothAttackRelease(out, BAND_ATTACK, BAND_RELEASE)
  return out
}

/** Every ArrayBuffer inside an analysis, for postMessage transfer lists. */
export function analysisTransferables(analysis: AudioAnalysis): ArrayBuffer[] {
  const { features, rhythm } = analysis
  return [
    features.spectrum.data,
    features.rms,
    features.peak,
    features.lufsShortTerm,
    features.bands.low,
    features.bands.mid,
    features.bands.high,
    features.stereo.correlation,
    features.stereo.width,
    rhythm.beats,
    rhythm.downbeats,
    rhythm.onsets,
    rhythm.vocalOnsets,
  ].map((array) => array.buffer as ArrayBuffer)
}
