/**
 * STUB for the audio module: decodes the file and computes a crude Timeline so the preview
 * reacts to the music. The real analysis comes from `@/audio`; the main session swaps it in.
 */
import { TIMELINE_SCHEMA_VERSION, type FrameFeatures, type Timeline } from '@/shared'

const FEATURE_RATE = 60
const SPECTRUM_BINS = 48

export type AnalysisPhase = 'decoding' | 'analyzing'

export async function analyzeTrackStub(
  file: File,
  onPhase: (phase: AnalysisPhase) => void,
): Promise<Timeline> {
  onPhase('decoding')
  const context = new AudioContext()
  let buffer: AudioBuffer
  try {
    buffer = await context.decodeAudioData(await file.arrayBuffer())
  } finally {
    void context.close()
  }

  onPhase('analyzing')
  // Let the status repaint before the synchronous number crunching.
  await new Promise((resolve) => setTimeout(resolve, 0))

  return {
    version: TIMELINE_SCHEMA_VERSION,
    audio: {
      durationSec: buffer.duration,
      sampleRate: buffer.sampleRate,
      channelCount: buffer.numberOfChannels,
      features: computeFeatures(buffer),
      rhythm: {
        bpm: null,
        beats: new Float32Array(),
        downbeats: new Float32Array(),
        onsets: new Float32Array(),
        vocalOnsets: new Float32Array(),
      },
      vocalActivity: [],
    },
    lyrics: null,
    accents: [],
  }
}

function computeFeatures(buffer: AudioBuffer): FrameFeatures {
  const left = buffer.getChannelData(0)
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left
  const hop = buffer.sampleRate / FEATURE_RATE
  const frameCount = Math.max(1, Math.ceil(buffer.length / hop))

  const rms = new Float32Array(frameCount)
  const peak = new Float32Array(frameCount)
  const lufs = new Float32Array(frameCount)
  const low = new Float32Array(frameCount)
  const mid = new Float32Array(frameCount)
  const high = new Float32Array(frameCount)
  const correlation = new Float32Array(frameCount)
  const width = new Float32Array(frameCount)

  // One-pole low-passes split the signal into three rough bands.
  const kLow = 1 - Math.exp((-2 * Math.PI * 200) / buffer.sampleRate)
  const kHigh = 1 - Math.exp((-2 * Math.PI * 4000) / buffer.sampleRate)
  let lpLow = 0
  let lpHigh = 0

  for (let frame = 0; frame < frameCount; frame++) {
    const start = Math.floor(frame * hop)
    const end = Math.min(buffer.length, Math.floor((frame + 1) * hop))
    let sum = 0
    let max = 0
    let eLow = 0
    let eMid = 0
    let eHigh = 0
    let lr = 0
    let ll = 0
    let rr = 0
    let side = 0
    for (let i = start; i < end; i++) {
      const l = left[i] ?? 0
      const r = right[i] ?? 0
      const x = (l + r) * 0.5
      lpLow += kLow * (x - lpLow)
      lpHigh += kHigh * (x - lpHigh)
      sum += x * x
      max = Math.max(max, Math.abs(l), Math.abs(r))
      eLow += lpLow * lpLow
      eMid += (lpHigh - lpLow) * (lpHigh - lpLow)
      eHigh += (x - lpHigh) * (x - lpHigh)
      lr += l * r
      ll += l * l
      rr += r * r
      side += (l - r) * (l - r) * 0.25
    }
    const n = Math.max(1, end - start)
    rms[frame] = Math.sqrt(sum / n)
    peak[frame] = max
    lufs[frame] = 20 * Math.log10(Math.max(rms[frame] ?? 0, 1e-6)) - 0.691
    low[frame] = Math.sqrt(eLow / n)
    mid[frame] = Math.sqrt(eMid / n)
    high[frame] = Math.sqrt(eHigh / n)
    correlation[frame] = ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1
    width[frame] = sum > 0 ? Math.min(1, Math.sqrt(side / sum)) : 0
  }

  normalize(low)
  normalize(mid)
  normalize(high)

  // Fake log spectrum: three bands smeared over the bins. Good enough to animate bars.
  const spectrum = new Float32Array(frameCount * SPECTRUM_BINS)
  for (let frame = 0; frame < frameCount; frame++) {
    for (let bin = 0; bin < SPECTRUM_BINS; bin++) {
      const p = bin / (SPECTRUM_BINS - 1)
      const value =
        (low[frame] ?? 0) * bump(p, 0.08, 0.12) +
        (mid[frame] ?? 0) * bump(p, 0.45, 0.2) +
        (high[frame] ?? 0) * bump(p, 0.85, 0.15)
      spectrum[frame * SPECTRUM_BINS + bin] = Math.min(1, value)
    }
  }

  return {
    rate: FEATURE_RATE,
    frameCount,
    spectrum: { binCount: SPECTRUM_BINS, minHz: 20, maxHz: 20000, data: spectrum },
    rms,
    peak,
    lufsShortTerm: lufs,
    bands: { low, mid, high },
    stereo: { correlation, width },
  }
}

function normalize(values: Float32Array) {
  let max = 0
  for (const value of values) max = Math.max(max, value)
  if (max > 0) for (let i = 0; i < values.length; i++) values[i] = (values[i] ?? 0) / max
}

function bump(x: number, center: number, spread: number): number {
  const d = (x - center) / spread
  return Math.exp(-d * d)
}
