/**
 * Lyrics recognition: `@/ml` Whisper on the track's PCM, resampled to 16 kHz mono.
 * In dev, `?fake-asr` in the URL switches to a fake recognizer (no model download).
 */
import { toMono16k } from '@/audio'
import type { RecognizedWord } from '@/lyrics'
import {
  estimateModelDownload,
  transcribe as runWhisper,
  type DownloadEstimate,
  type TranscribeQuality,
} from '@/ml'
import type { Timeline } from '@/shared'
import { pcmFor } from './analysis'
import { transcribeFake } from './transcribe.fake'

export type { DownloadEstimate, TranscribeQuality }
export { MAX_QUALITY_WARNING } from '@/ml'

export type RecognizeLanguage = 'ru' | 'en' | 'auto'

export interface RecognizeProgress {
  stage: 'device' | 'load' | 'recognize'
  /** 0..1 within the stage. */
  fraction: number
  /** Device downgrade or memory warning from the ML module. */
  note: string | null
}

export interface TranscribeJob {
  file: File
  timeline: Timeline
  language: RecognizeLanguage
  quality: TranscribeQuality
  onProgress: (progress: RecognizeProgress) => void
  signal: AbortSignal
}

export const useFakeRecognizer =
  import.meta.env.DEV &&
  typeof location !== 'undefined' &&
  new URLSearchParams(location.search).has('fake-asr')

/** What a run would download; null with the fake recognizer (nothing to download). */
export async function estimateDownload(
  quality: TranscribeQuality,
): Promise<DownloadEstimate | null> {
  return useFakeRecognizer ? null : estimateModelDownload(quality)
}

export async function transcribe(job: TranscribeJob): Promise<RecognizedWord[]> {
  if (useFakeRecognizer) return transcribeFake(job)
  const pcm = pcmFor(job.timeline)
  if (!pcm) throw new Error('Нет аудиоданных трека')
  let note: string | null = null
  return runWhisper(toMono16k(pcm), {
    language: job.language,
    quality: job.quality,
    vocalActivity: job.timeline.audio.vocalActivity,
    signal: job.signal,
    onProgress: (progress) => {
      if (progress.stage === 'device') {
        note = progress.note
        job.onProgress({ stage: 'device', fraction: 0, note })
      } else if (progress.stage === 'load') {
        const fraction = progress.total > 0 ? progress.loaded / progress.total : 0
        job.onProgress({ stage: 'load', fraction, note })
      } else {
        const fraction = progress.totalSec > 0 ? progress.doneSec / progress.totalSec : 0
        job.onProgress({ stage: 'recognize', fraction, note })
      }
    },
  })
}
