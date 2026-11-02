/** Decoded PCM, one Float32Array per channel (all the same length), samples in -1..1. */
export interface DecodedAudio {
  sampleRate: number
  channels: Float32Array[]
  durationSec: number
}

export type AnalysisStage = 'decode' | 'analyze' | 'resample'

export interface AnalysisProgress {
  stage: AnalysisStage
  /** 0..1 within the stage. */
  fraction: number
}
