import type { WorkerRequest, WorkerResponse } from './protocol'
import type {
  LoadProgress,
  LoadStats,
  TranscribeOptions,
  TranscribeResult,
  WhisperLoadOptions,
} from './types'

/**
 * Main-thread handle to the Whisper worker. One request at a time.
 * `cancel()` stops recognition at the next window boundary; `dispose()` kills the worker immediately.
 */
export class WhisperClient {
  private worker = createWorker()
  private pending: {
    resolve: (value: never) => void
    reject: (error: Error) => void
    onProgress?: (message: WorkerResponse) => void
  } | null = null

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handle(event.data)
    this.worker.onerror = (event) => this.settle(new Error(event.message || 'worker error'))
  }

  load(options: WhisperLoadOptions, onProgress?: (p: LoadProgress) => void): Promise<LoadStats> {
    return this.request({ type: 'load', options }, (m) => {
      if (m.type === 'load-progress') onProgress?.(m.progress)
    })
  }

  /** Transfers `audio` (16 kHz mono) to the worker; the caller's buffer becomes unusable. */
  transcribe(
    audio: Float32Array,
    options: TranscribeOptions,
    onProgress?: (doneSec: number, totalSec: number) => void,
  ): Promise<TranscribeResult> {
    return this.request(
      { type: 'transcribe', audio, options },
      (m) => {
        if (m.type === 'transcribe-progress') onProgress?.(m.doneSec, m.totalSec)
      },
      [audio.buffer],
    )
  }

  cancel(): void {
    this.worker.postMessage({ type: 'cancel' } satisfies WorkerRequest)
  }

  dispose(): void {
    this.worker.terminate()
    this.settle(new Error('disposed'))
  }

  private request<T>(
    message: WorkerRequest,
    onProgress: (m: WorkerResponse) => void,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.pending) return Promise.reject(new Error('WhisperClient is busy'))
    return new Promise<T>((resolve, reject) => {
      this.pending = { resolve: resolve as (value: never) => void, reject, onProgress }
      this.worker.postMessage(message, transfer)
    })
  }

  private handle(message: WorkerResponse): void {
    const pending = this.pending
    if (!pending) return
    switch (message.type) {
      case 'loaded':
        this.pending = null
        pending.resolve(message.stats as never)
        break
      case 'result':
        this.pending = null
        pending.resolve(message.result as never)
        break
      case 'cancelled':
        this.settle(new Error('cancelled'))
        break
      case 'error':
        this.settle(new Error(message.message))
        break
      default:
        pending.onProgress?.(message)
    }
  }

  private settle(error: Error): void {
    const pending = this.pending
    this.pending = null
    pending?.reject(error)
  }
}

function createWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'whisper' })
}
