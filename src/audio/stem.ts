import type { AudioAnalysis, TimeRange } from '@/shared'
import { binRange, FEATURE_RATE, fftSizeFor } from './analyze'
import { FFT, hannWindow } from './fft'
import { downmixToMono } from './resample'
import { frameTimeFor, pickOnsets, VOCAL_ONSET_PICKING } from './rhythm'
import type { DecodedAudio } from './types'
import {
  detectVocalActivity,
  fluxEnvelope,
  frameEnergy,
  STEM_VOCAL_ACTIVITY,
  timesWithin,
  VOCAL_BAND_HZ,
} from './vocal'

export interface VocalCues {
  vocalOnsets: Float32Array
  vocalActivity: TimeRange[]
}

/**
 * Vocal onsets and activity from an isolated vocal track (e.g. the HTDemucs vocals stem).
 * No percussion suppression here: on a clean stem, consonant transients are exactly the word
 * starts we want. Pure and deterministic; ~0.5 s for 3 minutes.
 */
export function analyzeVocalStem(stem: DecodedAudio, options: { rate?: number } = {}): VocalCues {
  const rate = options.rate ?? FEATURE_RATE
  const { sampleRate } = stem
  const mono = downmixToMono(stem.channels)
  const length = mono.length
  const durationSec = length / sampleRate
  const frameCount = Math.ceil((length * rate) / sampleRate)
  const hop = sampleRate / rate

  const fftSize = fftSizeFor(sampleRate)
  const half = fftSize / 2
  const fft = new FFT(fftSize)
  const window = hannWindow(fftSize)
  const re = new Float64Array(fftSize)
  const im = new Float64Array(fftSize)
  const powerScale = 32 / (3 * fftSize * fftSize)
  const { from, to } = binRange(VOCAL_BAND_HZ[0], VOCAL_BAND_HZ[1], sampleRate, fftSize)
  const binCount = to - from
  const power = new Float32Array(frameCount * binCount)

  for (let i = 0; i < frameCount; i++) {
    const start = Math.round((i + 0.5) * hop) - half
    for (let k = 0; k < fftSize; k++) {
      const s = start + k
      re[k] = s >= 0 && s < length ? mono[s]! * window[k]! : 0
      im[k] = 0
    }
    fft.transform(re, im)
    for (let k = from; k < to; k++) {
      power[i * binCount + k - from] = (re[k]! * re[k]! + im[k]! * im[k]!) * powerScale
    }
  }

  const vocalActivity = detectVocalActivity(
    frameEnergy(power, frameCount, binCount),
    rate,
    durationSec,
    STEM_VOCAL_ACTIVITY,
  )
  const frameTime = frameTimeFor(rate, fftSize, sampleRate, durationSec)
  const onsets = pickOnsets(
    fluxEnvelope(power, frameCount, binCount),
    rate,
    frameTime,
    VOCAL_ONSET_PICKING,
  )
  return { vocalOnsets: timesWithin(onsets, vocalActivity), vocalActivity }
}

/** A copy of `analysis` with vocal onsets and activity recomputed from the vocal stem. */
export function applyVocalStem(analysis: AudioAnalysis, stem: DecodedAudio): AudioAnalysis {
  const cues = analyzeVocalStem(stem, { rate: analysis.features.rate })
  return {
    ...analysis,
    rhythm: { ...analysis.rhythm, vocalOnsets: cues.vocalOnsets },
    vocalActivity: cues.vocalActivity,
  }
}
