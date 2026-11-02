import { exportVideo as runExport } from '@/export'
import type { FrameRenderer, OutputSettings, Timeline } from '@/shared'
import { pcmFor } from './analysis'

export interface ExportJob {
  timeline: Timeline
  output: OutputSettings
  createRenderer: () => FrameRenderer
  /** 0..1 */
  onProgress: (progress: number) => void
  signal: AbortSignal
}

export interface ExportedFile {
  blob: Blob
  fileExtension: string
}

/** Resolves with the encoded file. Rejects with AbortError when cancelled. */
export async function exportVideo(job: ExportJob): Promise<ExportedFile> {
  const { timeline, output } = job
  const pcm = pcmFor(timeline)
  const result = await runExport({
    renderer: job.createRenderer(),
    timeline,
    scene: null,
    output,
    audio: pcm ? { sampleRate: pcm.sampleRate, channels: pcm.channels } : null,
    durationSec: timeline.audio.durationSec,
    onProgress: (progress) => job.onProgress(progress.fraction),
    signal: job.signal,
  })
  if (!result.blob) throw new Error('Экспорт не вернул файл')
  // mediabunny reports extensions with a leading dot (".mp4").
  return { blob: result.blob, fileExtension: result.fileExtension.replace(/^\./, '') }
}
