/**
 * The one place that decides where model weights come from.
 *
 * Each model has an upstream repo (onnx-community, pinned by commit) and our mirror (DarumOrt/*,
 * pinned in models.json). The mirror is used as soon as models.json has a revision for the model;
 * until then — or with PREFER_UPSTREAM — weights load from upstream.
 */
import { env } from '@huggingface/transformers'
// Self-hosted ONNX Runtime WASM (transformers.js would otherwise fetch it from cdn.jsdelivr.net).
import ortWasmFactoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { verifyingFetch } from './integrity'
import { mirroredModel } from './manifest'

const HF_HOST = 'https://huggingface.co/'

/** Force upstream repos even when a mirror exists (debugging only). */
const PREFER_UPSTREAM = false

export interface ModelSource {
  id: string
  upstream: string
  upstreamRevision: string
}

export interface ResolvedModel {
  repo: string
  revision: string
  mirrored: boolean
}

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
  env.fetch = verifyingFetch(env.fetch)
  const wasm = env.backends.onnx.wasm
  if (wasm) {
    wasm.wasmPaths = {
      mjs: new URL(ortWasmFactoryUrl, self.location.href).href,
      wasm: new URL(ortWasmUrl, self.location.href).href,
    }
  }
}

export function resolveModel(source: ModelSource): ResolvedModel {
  const mirror = PREFER_UPSTREAM ? null : mirroredModel(source.id)
  return mirror
    ? { repo: mirror.repo, revision: mirror.revision, mirrored: true }
    : { repo: source.upstream, revision: source.upstreamRevision, mirrored: false }
}
