/// <reference lib="webworker" />
import { Cancelled, WhisperEngine } from './engine'
import type { WorkerRequest, WorkerResponse } from './protocol'

let engine: WhisperEngine | null = null
let cancelled = false

const post = (message: WorkerResponse) => self.postMessage(message)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  try {
    switch (request.type) {
      case 'load': {
        await engine?.dispose()
        engine = null
        const loaded = await WhisperEngine.load(request.options, (progress) =>
          post({ type: 'load-progress', progress }),
        )
        engine = loaded.engine
        post({ type: 'loaded', stats: loaded.stats })
        break
      }
      case 'transcribe': {
        if (!engine) throw new Error('model is not loaded')
        cancelled = false
        const result = await engine.transcribe(
          request.audio,
          request.options,
          (doneSec, totalSec) => post({ type: 'transcribe-progress', doneSec, totalSec }),
          () => cancelled,
        )
        post({ type: 'result', result })
        break
      }
      case 'cancel':
        cancelled = true
        break
    }
  } catch (error) {
    if (error instanceof Cancelled) post({ type: 'cancelled' })
    else post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
