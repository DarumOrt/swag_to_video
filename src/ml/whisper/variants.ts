import type { ModelSource } from '../resolve'

export type WhisperModelId =
  | 'whisper-tiny-timestamped'
  | 'whisper-base-timestamped'
  | 'whisper-small-timestamped'
  | 'whisper-large-v3-turbo-timestamped'

export type WhisperDevice = 'webgpu' | 'wasm'

/** transformers.js dtype names; the file suffix is resolved by the library. */
export type WhisperDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'

export interface WhisperDtypes {
  encoder_model: WhisperDtype
  decoder_model_merged: WhisperDtype
}

/** `_timestamped` exports include cross-attention outputs, needed for word timestamps. */
export const WHISPER_MODELS: Record<WhisperModelId, ModelSource & { label: string }> = {
  'whisper-tiny-timestamped': {
    id: 'whisper-tiny-timestamped',
    label: 'tiny',
    upstream: 'onnx-community/whisper-tiny_timestamped',
    upstreamRevision: '517244293732ee2d58139af5814231b7e6830a0d',
  },
  'whisper-base-timestamped': {
    id: 'whisper-base-timestamped',
    label: 'base',
    upstream: 'onnx-community/whisper-base_timestamped',
    upstreamRevision: '608c49e61301901684bc36cac8f74b95ff6b5a8e',
  },
  'whisper-small-timestamped': {
    id: 'whisper-small-timestamped',
    label: 'small',
    upstream: 'onnx-community/whisper-small_timestamped',
    upstreamRevision: '65caa70f294b46e1c33ff820aae6b16d048ab818',
  },
  'whisper-large-v3-turbo-timestamped': {
    id: 'whisper-large-v3-turbo-timestamped',
    label: 'large-v3-turbo',
    upstream: 'onnx-community/whisper-large-v3-turbo_timestamped',
    upstreamRevision: 'b3f77bf9a8c4d5ea3415827033d1ffea7955fd9a',
  },
}

/** Dtype presets per device. WASM has no fp16 kernels worth using; WebGPU fp32 encoder is the known-good config. */
export const DTYPE_PRESETS: Record<string, WhisperDtypes> = {
  'enc fp32 / dec q4': { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  'enc fp16 / dec q4f16': { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
  'enc q8 / dec q8': { encoder_model: 'q8', decoder_model_merged: 'q8' },
  'enc fp32 / dec q8': { encoder_model: 'fp32', decoder_model_merged: 'q8' },
  /** For large-v3-turbo: its fp32/fp16 encoders are 2.5 / 1.3 GB. */
  'enc q4f16 / dec q4f16': { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' },
}

export function defaultDtypes(device: WhisperDevice): WhisperDtypes {
  return device === 'webgpu'
    ? DTYPE_PRESETS['enc fp32 / dec q4']!
    : DTYPE_PRESETS['enc q8 / dec q8']!
}
