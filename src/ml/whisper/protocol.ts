import type {
  LoadProgress,
  LoadStats,
  TranscribeOptions,
  TranscribeResult,
  WhisperLoadOptions,
} from './types'

export type WorkerRequest =
  | { type: 'load'; options: WhisperLoadOptions }
  | { type: 'transcribe'; audio: Float32Array; options: TranscribeOptions }
  | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'load-progress'; progress: LoadProgress }
  | { type: 'loaded'; stats: LoadStats }
  | { type: 'transcribe-progress'; doneSec: number; totalSec: number }
  | { type: 'result'; result: TranscribeResult }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
