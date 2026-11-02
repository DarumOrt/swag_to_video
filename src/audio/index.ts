/**
 * Public API of the audio module.
 * Owned by the "Аудио-анализ" session — see docs/sessions/audio-analysis.md.
 */
import type { AudioAnalysis } from '@/shared'
import { decodeAudio } from './decode'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { AnalysisProgress, DecodedAudio } from './types'

export {
  analyzePcm,
  BAND_EDGES_HZ,
  FEATURE_RATE,
  SPECTRUM_BINS,
  SPECTRUM_DB_FLOOR,
  SPECTRUM_MAX_HZ,
  SPECTRUM_MIN_HZ,
} from './analyze'
export { decodeAudio, DEFAULT_DECODE_SAMPLE_RATE, type DecodeOptions } from './decode'
export { LUFS_FLOOR } from './loudness'
export { downmixToMono, ML_SAMPLE_RATE, resample, toMono16k } from './resample'
export type { AnalysisProgress, AnalysisStage, DecodedAudio } from './types'

export interface AnalyzeAudioOptions {
  onProgress?: (progress: AnalysisProgress) => void
  /** Aborting terminates the worker and rejects with the signal's reason. */
  signal?: AbortSignal
  /** Decode rate for file input (default 48 kHz). */
  sampleRate?: number
  /** Also compute the 16 kHz mono copy for ML in the same worker. */
  mono16k?: boolean
}

export interface AnalyzeAudioResult {
  analysis: AudioAnalysis
  pcm: DecodedAudio
  /** 16 kHz mono, only when `mono16k: true` was requested. */
  mono16k: Float32Array | null
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError')
}

/**
 * Decodes (main thread, Web Audio) and analyzes (Web Worker) a track.
 * A DecodedAudio input is copied before it goes to the worker, so it stays usable.
 */
export async function analyzeAudio(
  input: Blob | ArrayBuffer | DecodedAudio,
  options: AnalyzeAudioOptions = {},
): Promise<AnalyzeAudioResult> {
  const { onProgress, signal } = options
  if (signal?.aborted) throw abortReason(signal)

  let channels: Float32Array[]
  let sampleRate: number
  if (input instanceof Blob || input instanceof ArrayBuffer) {
    onProgress?.({ stage: 'decode', fraction: 0 })
    const decoded = await decodeAudio(input, { sampleRate: options.sampleRate })
    if (signal?.aborted) throw abortReason(signal)
    onProgress?.({ stage: 'decode', fraction: 1 })
    channels = decoded.channels
    sampleRate = decoded.sampleRate
  } else {
    channels = input.channels.map((c) => c.slice())
    sampleRate = input.sampleRate
  }

  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  try {
    return await new Promise<AnalyzeAudioResult>((resolve, reject) => {
      const onAbort = () => reject(abortReason(signal!))
      signal?.addEventListener('abort', onAbort, { once: true })
      const settle = () => signal?.removeEventListener('abort', onAbort)

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data
        if (message.type === 'progress') {
          onProgress?.({ stage: message.stage, fraction: message.fraction })
        } else if (message.type === 'done') {
          settle()
          const length = message.channels[0]?.length ?? 0
          resolve({
            analysis: message.analysis,
            pcm: { sampleRate, channels: message.channels, durationSec: length / sampleRate },
            mono16k: message.mono16k,
          })
        } else {
          settle()
          reject(new Error(`Audio analysis failed: ${message.message}`))
        }
      }
      worker.onerror = (event) => {
        settle()
        reject(new Error(`Audio analysis worker crashed: ${event.message}`))
      }

      const request: WorkerRequest = { sampleRate, channels, mono16k: options.mono16k ?? false }
      worker.postMessage(
        request,
        channels.map((c) => c.buffer as ArrayBuffer),
      )
    })
  } finally {
    worker.terminate()
  }
}
