import { TIMELINE_SCHEMA_VERSION, type Timeline } from '@/shared'

/** Minimal empty timeline for the test renderer (it does not read it). */
export function stubTimeline(durationSec: number, sampleRate = 48_000): Timeline {
  const empty = new Float32Array(0)
  return {
    version: TIMELINE_SCHEMA_VERSION,
    audio: {
      durationSec,
      sampleRate,
      channelCount: 2,
      features: {
        rate: 60,
        frameCount: 0,
        spectrum: { binCount: 0, minHz: 20, maxHz: 20_000, data: empty },
        rms: empty,
        peak: empty,
        lufsShortTerm: empty,
        bands: { low: empty, mid: empty, high: empty },
        stereo: { correlation: empty, width: empty },
      },
      rhythm: { bpm: null, beats: empty, downbeats: empty, onsets: empty, vocalOnsets: empty },
      vocalActivity: [],
    },
    lyrics: null,
    accents: [],
  }
}
