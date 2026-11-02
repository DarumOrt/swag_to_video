import { FileAudio } from 'lucide-react'
import { Button, Dropzone, Panel } from '@/ui'
import { loadTrack } from '../actions'
import { formatBytes, formatTime } from '../format'
import { t } from '../i18n'
import { useAppStore } from '../store'
import { AnalysisStatusBadge } from './AnalysisStatusBadge'
import { AUDIO_ACCEPT } from './TrackDropzone'

export function TrackPanel() {
  const track = useAppStore((state) => state.track)
  const exporting = useAppStore((state) => state.export.status === 'running')
  if (!track) return null

  return (
    <Panel title={t.track.title}>
      <Dropzone
        accept={AUDIO_ACCEPT}
        onFile={(file) => void loadTrack(file)}
        disabled={exporting}
        className="border-solid border-line bg-bg"
      >
        {({ dragging, open }) => (
          <div className="flex items-center gap-3 p-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-raised text-accent">
              <FileAudio aria-hidden className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium" title={track.name}>
                {dragging ? t.track.dropActive : track.name}
              </p>
              <p className="tabular font-mono text-2xs text-subtle">
                {track.durationSec !== null ? formatTime(track.durationSec) : '—'} ·{' '}
                {formatBytes(track.file.size)}
              </p>
            </div>
            <Button size="sm" onClick={open} disabled={exporting}>
              {t.track.replace}
            </Button>
          </div>
        )}
      </Dropzone>
      <AnalysisStatusBadge />
    </Panel>
  )
}
