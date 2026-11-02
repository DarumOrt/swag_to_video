import { analysisTransferables, analyzePcm } from './analyze'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { toMono16k } from './resample'

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void
}

const scope = globalThis as unknown as WorkerScope

scope.onmessage = (event) => {
  const { sampleRate, channels, mono16k } = event.data
  try {
    const length = channels[0]?.length ?? 0
    const pcm = { sampleRate, channels, durationSec: length / sampleRate }
    const analysis = analyzePcm(pcm, {
      onProgress: (fraction) => scope.postMessage({ type: 'progress', stage: 'analyze', fraction }),
    })
    let resampled: Float32Array | null = null
    if (mono16k) {
      scope.postMessage({ type: 'progress', stage: 'resample', fraction: 0 })
      resampled = toMono16k(pcm)
      scope.postMessage({ type: 'progress', stage: 'resample', fraction: 1 })
    }
    const transfer: Transferable[] = [
      ...analysisTransferables(analysis),
      ...channels.map((c) => c.buffer as ArrayBuffer),
    ]
    if (resampled) transfer.push(resampled.buffer as ArrayBuffer)
    scope.postMessage({ type: 'done', analysis, channels, mono16k: resampled }, transfer)
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
