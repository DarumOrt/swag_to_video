import type { WordTiming } from './segments'
import type { WhisperDevice, WhisperDtypes, WhisperModelId } from './variants'

export type { WordTiming }

export type WhisperLanguage = 'ru' | 'en'

export interface WhisperLoadOptions {
  model: WhisperModelId
  device: WhisperDevice
  dtype: WhisperDtypes
}

export interface TranscribeOptions {
  /** 'auto' detects ru/en on the loudest 30 s window. */
  language: WhisperLanguage | 'auto'
  /** Regions to transcribe (seconds). Omit to process the whole track. */
  regions?: { start: number; end: number }[]
}

export interface RecognizedSegment {
  start: number
  end: number
  text: string
  words: WordTiming[]
  /** Why the segment looks suspicious, if it does. Dropped segments are not returned at all. */
  flags: ('repetition' | 'truncated')[]
}

export interface TranscribeStats {
  audioSec: number
  /** Wall time of recognition, excluding model loading. */
  elapsedMs: number
  windows: number
  /** Windows re-decoded with temperature after looping to the token limit. */
  retries: number
  /** Segments removed by the hallucination filter. */
  droppedSegments: string[]
}

export interface TranscribeResult {
  language: WhisperLanguage
  segments: RecognizedSegment[]
  /** All words of all segments, in order. */
  words: WordTiming[]
  stats: TranscribeStats
}

export interface LoadStats {
  elapsedMs: number
  /** Bytes fetched from the network (0 when fully cached). */
  downloadedBytes: number
  repo: string
  revision: string
  mirrored: boolean
}

export type LoadProgress = { file: string; loaded: number; total: number }
