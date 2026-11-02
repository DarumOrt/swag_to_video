/**
 * Public API of the ml module.
 * Owned by the "ML-модели и Hugging Face" session — see docs/sessions/ml-models.md.
 *
 * App flow: estimateModelDownload() → (prompt if toDownloadBytes > 0) → transcribe(mono16k, …)
 * → RecognizedWord[] for alignLyrics() in @/lyrics.
 */

// Recognition
export {
  estimateModelDownload,
  transcribe,
  type DownloadEstimate,
  type TranscribeProgress,
  type TranscribeRequest,
} from './transcribe'
export {
  MAX_QUALITY_WARNING,
  chooseConfig,
  probeDevice,
  type DeviceProfile,
  type ModelConfig,
  type TranscribeQuality,
} from './device'
export { vocalRegions, type TimeRange } from './regions'
export { toMono16k, WHISPER_SAMPLE_RATE } from './audio'

// Model cache (settings screen)
export {
  deleteCachedModel,
  deleteCachedModels,
  listCachedModels,
  requestPersistentStorage,
  storageEstimate,
  type CachedRepo,
} from './cache'
export { manifest, type ManifestModel, type ModelManifest } from './manifest'

// Low-level (dev page, benchmarks)
export { WhisperClient } from './whisper/client'
export type {
  LoadProgress,
  LoadStats,
  RecognizedSegment,
  TranscribeOptions,
  TranscribeResult,
  WhisperLanguage,
  WhisperLoadOptions,
  WordTiming,
} from './whisper/types'
export {
  DTYPE_PRESETS,
  WHISPER_MODELS,
  defaultDtypes,
  type WhisperDevice,
  type WhisperDtypes,
  type WhisperModelId,
} from './whisper/variants'
