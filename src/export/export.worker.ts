/**
 * Export worker: renders with SceneRenderer on its own OffscreenCanvas and encodes, so the UI
 * thread stays free. Driven by `exportVideoInWorker` (workerClient.ts); one export per worker.
 */

import { SceneRenderer } from '@/render'
import { exportVideo, type ExportProgress, type ExportResult } from './exportVideo'
import type { WorkerExportJob } from './workerProtocol'

export type WorkerRequest = { type: 'start'; job: WorkerExportJob } | { type: 'cancel' }

export type WorkerResponse =
  | { type: 'progress'; progress: ExportProgress }
  | { type: 'done'; result: ExportResult }
  | { type: 'error'; name: string; message: string }

const abort = new AbortController()
const post = (message: WorkerResponse) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  if (message.type === 'cancel') {
    abort.abort()
    return
  }
  const { job } = message
  try {
    const result = await exportVideo({
      ...job,
      renderer: new SceneRenderer(),
      signal: abort.signal,
      onProgress: (progress) => post({ type: 'progress', progress }),
    })
    post({ type: 'done', result })
  } catch (error) {
    const name = error instanceof Error || error instanceof DOMException ? error.name : 'Error'
    post({ type: 'error', name, message: error instanceof Error ? error.message : String(error) })
  }
}
