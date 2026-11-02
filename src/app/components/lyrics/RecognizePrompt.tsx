import { TriangleAlert } from 'lucide-react'
import { Button, Segmented, type SegmentedOption } from '@/ui'
import { MAX_QUALITY_WARNING, type RecognizeLanguage, type TranscribeQuality } from '../../adapters'
import { formatBytes } from '../../format'
import { t } from '../../i18n'
import {
  confirmRecognition,
  dismissRecognitionPrompt,
  setRecognizeLanguage,
  setRecognizeQuality,
} from '../../lyricsActions'
import type { LyricsEditorState } from '../../lyricsStore'

const QUALITY_OPTIONS: SegmentedOption<TranscribeQuality>[] = [
  { value: 'light', label: t.lyrics.prompt.light },
  { value: 'max', label: t.lyrics.prompt.max },
]

const LANGUAGE_OPTIONS: SegmentedOption<RecognizeLanguage>[] = [
  { value: 'auto', label: t.lyrics.prompt.auto },
  { value: 'ru', label: t.lyrics.prompt.ru },
  { value: 'en', label: t.lyrics.prompt.en },
]

/** Shown before recognition when the model is not cached yet: size, quality, language. */
export function RecognizePrompt({ prompt }: { prompt: NonNullable<LyricsEditorState['prompt']> }) {
  const { estimate, quality, language } = prompt
  const needsDownload = (estimate?.toDownloadBytes ?? 0) > 0
  const warnings = [quality === 'max' ? MAX_QUALITY_WARNING : null, estimate?.note ?? null].filter(
    (warning): warning is string => Boolean(warning),
  )

  return (
    <section
      aria-label={t.lyrics.prompt.title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') dismissRecognitionPrompt()
      }}
      className="flex shrink-0 flex-col gap-3 border-b border-line bg-raised/60 p-4"
    >
      <h3 className="text-[13px] font-medium">{t.lyrics.prompt.title}</h3>
      <div className="grid grid-cols-2 gap-3">
        <Segmented
          label={t.lyrics.prompt.quality}
          value={quality}
          options={QUALITY_OPTIONS}
          onChange={(next) => void setRecognizeQuality(next)}
        />
        <Segmented
          label={t.lyrics.prompt.language}
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setRecognizeLanguage}
        />
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {!estimate
          ? t.lyrics.prompt.estimating
          : needsDownload
            ? t.lyrics.prompt.download(formatBytes(estimate.toDownloadBytes))
            : t.lyrics.prompt.cached}{' '}
        {t.lyrics.prompt.local}
      </p>
      {warnings.map((warning) => (
        <p key={warning} className="flex gap-2 text-xs text-warn">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {warning}
        </p>
      ))}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" disabled={!estimate} onClick={confirmRecognition}>
          {needsDownload ? t.lyrics.prompt.start : t.lyrics.prompt.startCached}
        </Button>
        <Button variant="ghost" size="sm" onClick={dismissRecognitionPrompt}>
          {t.lyrics.cancel}
        </Button>
      </div>
    </section>
  )
}
