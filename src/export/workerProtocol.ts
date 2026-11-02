import type { PcmAudio } from './audio'
import type { ExportOptions } from './exportVideo'
import type { ResolvedExportConfig } from './support'

/**
 * What the main thread sends to the export worker. Everything is structured-cloneable:
 * timeline typed arrays and PCM are copied, the file handle is cloned, the renderer is created
 * inside the worker.
 */
export interface WorkerExportJob extends Omit<
  ExportOptions,
  'renderer' | 'writable' | 'onProgress' | 'signal' | 'audio'
> {
  /** Already mixed down and resampled to `config.audio.config.sampleRate` on the main thread. */
  audio: PcmAudio | null
  config: ResolvedExportConfig
}
