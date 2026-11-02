/**
 * Public API of the lyrics module.
 * Owned by the "Текст и тайминги" session — see docs/sessions/lyrics-sync.md.
 *
 * Everything here is pure: functions return new `Lyrics` and never mutate their input.
 * Typical flow: parseLyricsText → alignLyrics(…, whisperWords) → snapToOnsets(…, rhythm.vocalOnsets).
 */
export {
  buildLine,
  createLineIdFactory,
  flattenWords,
  isTimed,
  lyricsToText,
  parseLyricsText,
  withWords,
  wordId,
  type ParseTextOptions,
  type WordRef,
} from './model'
export {
  countSyllables,
  detectLanguage,
  isWordToken,
  normalizeLine,
  normalizeWord,
  parseSectionLabel,
  tokenizeLine,
} from './text'
export { levenshtein, phoneticKey, transliterate, wordSimilarity } from './similarity'
export {
  DEFAULT_TIMING,
  distribute,
  sanitizeTimings,
  wordWeight,
  type Slot,
  type TimingOptions,
} from './timing'
export {
  formatLrcTime,
  parseLrc,
  toLrc,
  type LrcExportOptions,
  type LrcParseOptions,
  type LrcParseResult,
} from './lrc'
export {
  DEFAULT_MATCH,
  alignLyrics,
  matchWords,
  type AlignOptions,
  type AlignResult,
  type MatchOptions,
  type RecognizedWord,
  type WordMatch,
} from './align'
export { DEFAULT_SNAP, nearestOnset, snapToOnsets, type SnapOptions } from './snap'
export {
  applyTaps,
  nextTapUnit,
  recordRelease,
  recordTap,
  startTapSession,
  undoTap,
  type Tap,
  type TapMode,
  type TapSession,
} from './tap'
export {
  DEFAULT_RECOGNIZED_LINES,
  isUncertain,
  lyricsFromRecognized,
  type RecognizedLinesOptions,
} from './recognized'
