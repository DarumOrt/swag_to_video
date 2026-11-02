/**
 * App-facing recognition API: device choice, one model at a time, WebGPU → WASM fallback,
 * worker destroyed after every run (CLAUDE.md rule 11).
 */
import type { RecognizedWord } from '@/lyrics'
import { cachedUrls, requestPersistentStorage } from './cache'
import {
  chooseConfig,
  probeDevice,
  wasmFallback,
  type ModelConfig,
  type TranscribeQuality,
} from './device'
import { modelFiles } from './files'
import { vocalRegions, type TimeRange } from './regions'
import { WhisperClient } from './whisper/client'
import { SAMPLE_RATE } from './constants'
import type { WhisperDevice, WhisperModelId } from './whisper/variants'

export type TranscribeProgress =
  /** Which model/device will run; `note` explains a downgrade or warns about memory. */
  | { stage: 'device'; model: WhisperModelId; device: WhisperDevice; note: string | null }
  /** Model files: downloading, or reading from the browser cache. Bytes. */
  | { stage: 'load'; loaded: number; total: number }
  /** Recognition over the (vocal parts of the) track. Seconds of audio. */
  | { stage: 'recognize'; doneSec: number; totalSec: number }

export interface TranscribeRequest {
  /** 'auto' picks ru/en from the audio. */
  language: 'ru' | 'en' | 'auto'
  /** Default 'light'. 'max' = large-v3-turbo: show MAX_QUALITY_WARNING first. */
  quality?: TranscribeQuality
  /** `timeline.audio.vocalActivity`: instrumental parts are skipped (guards against hallucinations). */
  vocalActivity?: readonly TimeRange[]
  onProgress?: (progress: TranscribeProgress) => void
  /** Aborting kills the worker immediately and frees its memory. Rejects with the signal's reason. */
  signal?: AbortSignal
}

/** Confidence used when Whisper gave no probability for a word (rare: token limit hit). */
const UNKNOWN_CONFIDENCE = 0.5

let queue: Promise<unknown> = Promise.resolve()

/**
 * Recognizes words with timestamps in 16 kHz mono audio. Calls are queued: only one model is ever
 * loaded. `mono16k` is not modified.
 */
export function transcribe(
  mono16k: Float32Array,
  request: TranscribeRequest,
): Promise<RecognizedWord[]> {
  const run = queue.then(() => runTranscription(mono16k, request))
  queue = run.catch(() => undefined)
  return run
}

async function runTranscription(
  mono16k: Float32Array,
  request: TranscribeRequest,
): Promise<RecognizedWord[]> {
  request.signal?.throwIfAborted()
  const config = chooseConfig(await probeDevice(), request.quality ?? 'light')
  try {
    return await attempt(mono16k, request, config)
  } catch (error) {
    if (config.device !== 'webgpu' || request.signal?.aborted || isIntegrityError(error))
      throw error
    // WebGPU failed (device lost, out of GPU memory, unsupported op): retry on the CPU.
    console.warn('[ml] WebGPU failed, falling back to WASM:', error)
    return attempt(mono16k, request, wasmFallback())
  }
}

async function attempt(
  mono16k: Float32Array,
  request: TranscribeRequest,
  config: ModelConfig,
): Promise<RecognizedWord[]> {
  const { onProgress, signal } = request
  onProgress?.({ stage: 'device', model: config.model, device: config.device, note: config.note })

  const client = new WhisperClient()
  const abort = () => client.dispose()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    void requestPersistentStorage()
    const files = new Map<string, { loaded: number; total: number }>()
    await client.load({ model: config.model, device: config.device, dtype: config.dtype }, (p) => {
      files.set(p.file, p)
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      onProgress?.({ stage: 'load', loaded, total })
    })

    const result = await client.transcribe(
      mono16k.slice(), // transferred to the worker; keep the caller's buffer intact
      {
        language: request.language,
        regions: vocalRegions(request.vocalActivity, mono16k.length / SAMPLE_RATE),
      },
      (doneSec, totalSec) => onProgress?.({ stage: 'recognize', doneSec, totalSec }),
    )
    return result.words.map((w) => ({
      text: w.text,
      start: w.start,
      end: w.end,
      confidence: w.confidence ?? UNKNOWN_CONFIDENCE,
    }))
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError')
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    client.dispose()
  }
}

function isIntegrityError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Integrity check failed')
}

export interface DownloadEstimate {
  model: WhisperModelId
  device: WhisperDevice
  note: string | null
  /** All model files for this configuration. */
  totalBytes: number
  /** What is not in the browser cache yet — 0 means no prompt is needed. */
  toDownloadBytes: number
}

/** For the "Download N MB once?" prompt: what `transcribe` with this quality would fetch. */
export async function estimateModelDownload(
  quality: TranscribeQuality = 'light',
): Promise<DownloadEstimate> {
  const config = chooseConfig(await probeDevice(), quality)
  const files = modelFiles(config.model, config.dtype)
  const cached = await cachedUrls(files.map((f) => f.url))
  return {
    model: config.model,
    device: config.device,
    note: config.note,
    totalBytes: files.reduce((s, f) => s + f.size, 0),
    toDownloadBytes: files.filter((f) => !cached.has(f.url)).reduce((s, f) => s + f.size, 0),
  }
}
