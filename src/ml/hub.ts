/**
 * transformers.js setup for the ML worker: HF host and path template, Cache API, SHA-256 verification
 * of downloads, self-hosted ONNX Runtime WASM. Which repo/revision to load is decided in resolve.ts.
 */
import { env } from '@huggingface/transformers'
// Self-hosted ONNX Runtime WASM (transformers.js would otherwise fetch it from cdn.jsdelivr.net).
import ortWasmFactoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { verifyingFetch } from './integrity'
import { MODEL_CACHE_KEY } from './constants'

const HF_HOST = 'https://huggingface.co/'

let configured = false

/** Applies global transformers.js settings. Idempotent; call before loading any model. */
export function configureHub(): void {
  if (configured) return
  configured = true
  env.remoteHost = HF_HOST
  env.remotePathTemplate = '{model}/resolve/{revision}/'
  env.allowRemoteModels = true
  env.allowLocalModels = false
  env.useBrowserCache = true
  env.cacheKey = MODEL_CACHE_KEY
  env.fetch = verifyingFetch(env.fetch)
  const wasm = env.backends.onnx.wasm
  if (wasm) {
    wasm.wasmPaths = {
      mjs: new URL(ortWasmFactoryUrl, self.location.href).href,
      wasm: new URL(ortWasmUrl, self.location.href).href,
    }
  }
}
