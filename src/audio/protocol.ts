import type { AudioAnalysis } from '@/shared'
import type { AnalysisStage } from './types'

/** Messages between `analyzeAudio` and `analysis.worker.ts`. */

export interface WorkerRequest {
  sampleRate: number
  channels: Float32Array[]
  mono16k: boolean
}

export type WorkerResponse =
  | { type: 'progress'; stage: AnalysisStage; fraction: number }
  | {
      type: 'done'
      analysis: AudioAnalysis
      /** The request's channels, transferred back. */
      channels: Float32Array[]
      mono16k: Float32Array | null
    }
  | { type: 'error'; message: string }
