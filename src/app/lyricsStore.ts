import { create } from 'zustand'
import type { RecognizedWord, TapMode, TapSession } from '@/lyrics'
import type {
  DownloadEstimate,
  RecognizeLanguage,
  RecognizeProgress,
  TranscribeQuality,
} from './adapters'

/**
 * Editor state around the lyrics. The lyrics themselves live in `timeline.lyrics` (app store),
 * so the preview always renders what the editor shows.
 */

export type RecognizeStatus = 'idle' | 'running' | 'done' | 'error'

/** Where the current lyrics came from: decides what "Распознать" does with them. */
export type LyricsOrigin = 'recognized' | 'text' | 'lrc'

export interface LyricsEditorState {
  recognized: RecognizedWord[] | null
  recognize: {
    status: RecognizeStatus
    stage: RecognizeProgress['stage'] | null
    /** 0..1 within the stage. */
    progress: number
    note: string | null
    error: string | null
  }
  /** Settings shown before recognition when a model download is needed. */
  prompt: {
    quality: TranscribeQuality
    language: RecognizeLanguage
    /** null while estimating. */
    estimate: DownloadEstimate | null
  } | null
  origin: LyricsOrigin | null
  /** Result of the last alignment to recognized words. */
  alignStats: { anchored: number; total: number } | null
  pasteOpen: boolean
  selectedWordId: string | null
  tapMode: TapMode
  tap: TapSession | null
  /** One-off message (e.g. a failed LRC import). */
  notice: { kind: 'info' | 'error'; text: string } | null
}

export const IDLE_RECOGNIZE: LyricsEditorState['recognize'] = {
  status: 'idle',
  stage: null,
  progress: 0,
  note: null,
  error: null,
}

export const INITIAL_LYRICS_EDITOR: LyricsEditorState = {
  recognized: null,
  recognize: IDLE_RECOGNIZE,
  prompt: null,
  origin: null,
  alignStats: null,
  pasteOpen: false,
  selectedWordId: null,
  tapMode: 'line',
  tap: null,
  notice: null,
}

export const useLyricsStore = create<LyricsEditorState>()(() => INITIAL_LYRICS_EDITOR)
