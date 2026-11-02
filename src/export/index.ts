/**
 * Public API of the export module.
 * Owned by the "Экспорт видео" session — see docs/sessions/video-export.md.
 */
export { exportVideo, ExportError } from './exportVideo'
export type { ExportOptions, ExportProgress, ExportResult, ExportStats } from './exportVideo'
export { checkExportSupport } from './support'
export type { AudioSpec, ExportSupport, ResolvedExportConfig } from './support'
export type { ExportAudio, PcmAudio } from './audio'
export { defaultVideoBitrate } from './codecs'
