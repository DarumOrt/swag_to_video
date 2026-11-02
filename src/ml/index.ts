/**
 * Public API of the ml module.
 * Owned by the "ML-модели и Hugging Face" session — see docs/sessions/ml-models.md.
 */
export { toMono16k, WHISPER_SAMPLE_RATE } from './audio'
export {
  deleteCachedModel,
  listCachedModels,
  requestPersistentStorage,
  storageEstimate,
  type CachedRepo,
} from './cache'
export { manifest, type ManifestModel, type ModelManifest } from './manifest'
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
