/**
 * Device probing and model configuration choice (memory budget, CLAUDE.md rule 11).
 * Typical user: 8 GB RAM, integrated GPU — WebGPU buffers live in the same RAM.
 */
import type { WhisperDevice, WhisperDtypes, WhisperModelId } from './whisper/variants'

/** 'light' = default; 'max' = large-v3-turbo, opt-in with a warning. */
export type TranscribeQuality = 'light' | 'max'

export interface DeviceProfile {
  /** WebGPU adapter usable for ML (not a software fallback adapter). */
  webgpu: boolean
  /** shader-f16 support (needed for the fp16 / q4f16 variants on WebGPU). */
  f16: boolean
  /** navigator.deviceMemory in GB (Chrome caps it at 8), null if unknown. */
  memoryGb: number | null
  adapter: { vendor: string; architecture: string } | null
}

export interface ModelConfig {
  model: WhisperModelId
  device: WhisperDevice
  dtype: WhisperDtypes
  /** Human-readable reason the requested quality was downgraded, or a warning about memory. */
  note: string | null
}

const LIGHT_WEBGPU: WhisperDtypes = { encoder_model: 'fp16', decoder_model_merged: 'q4f16' }
const LIGHT_WASM: WhisperDtypes = { encoder_model: 'q8', decoder_model_merged: 'q8' }
const MAX_WEBGPU: WhisperDtypes = { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }
/** Below this, even the light WebGPU variant risks the tab on an integrated GPU. */
const MIN_WEBGPU_MEMORY_GB = 4
const MIN_MAX_MEMORY_GB = 8

export const MAX_QUALITY_WARNING =
  'Режим «Максимум» скачивает ~0,6 ГБ и требует 3–4 ГБ свободной памяти. ' +
  'На ноутбуке со встроенной графикой и 8 ГБ ОЗУ закройте другие вкладки — иначе вкладка может упасть.'

export async function probeDevice(): Promise<DeviceProfile> {
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null
  const adapter = (await navigator.gpu?.requestAdapter().catch(() => null)) ?? null
  const fallback = (adapter?.info as (GPUAdapterInfo & { isFallbackAdapter?: boolean }) | undefined)
    ?.isFallbackAdapter
  return {
    webgpu: adapter !== null && fallback !== true,
    f16: adapter?.features.has('shader-f16') ?? false,
    memoryGb,
    adapter: adapter
      ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture }
      : null,
  }
}

export function chooseConfig(profile: DeviceProfile, quality: TranscribeQuality): ModelConfig {
  const gpuOk =
    profile.webgpu &&
    profile.f16 &&
    (profile.memoryGb === null || profile.memoryGb >= MIN_WEBGPU_MEMORY_GB)
  const light: ModelConfig = gpuOk
    ? { model: 'whisper-small-timestamped', device: 'webgpu', dtype: LIGHT_WEBGPU, note: null }
    : { model: 'whisper-small-timestamped', device: 'wasm', dtype: LIGHT_WASM, note: null }

  if (quality === 'light') return light
  const memoryOk = profile.memoryGb === null || profile.memoryGb >= MIN_MAX_MEMORY_GB
  if (!gpuOk || !memoryOk) {
    return {
      ...light,
      note: 'Режим «Максимум» недоступен на этом устройстве (нужны WebGPU с fp16 и 8 ГБ памяти) — используется обычный.',
    }
  }
  return {
    model: 'whisper-large-v3-turbo-timestamped',
    device: 'webgpu',
    dtype: MAX_WEBGPU,
    note: MAX_QUALITY_WARNING,
  }
}

/** The WASM config used after a WebGPU failure (device lost, out of GPU memory). */
export function wasmFallback(): ModelConfig {
  return {
    model: 'whisper-small-timestamped',
    device: 'wasm',
    dtype: LIGHT_WASM,
    note: 'Видеокарта не справилась — распознавание продолжено на процессоре (медленнее).',
  }
}
