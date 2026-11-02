import { AudioLines, Upload } from 'lucide-react'
import { useState } from 'react'
import { Button, Dropzone, cn } from '@/ui'
import { loadTrack } from '../actions'
import { t } from '../i18n'

export const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.flac,.ogg,.oga,.opus,.m4a,.aac,.webm'

/** Large empty-state drop target shown in place of the preview before a track is loaded. */
export function TrackDropzone({ className }: { className?: string }) {
  const [rejected, setRejected] = useState<string | null>(null)
  return (
    <Dropzone
      accept={AUDIO_ACCEPT}
      onFile={(file) => {
        setRejected(null)
        void loadTrack(file)
      }}
      onReject={(file) => setRejected(file.name)}
      className={cn('flex items-center justify-center', className)}
    >
      {({ dragging, open }) => (
        <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
          <div
            className={cn(
              'flex size-14 items-center justify-center rounded-full border border-line-strong bg-raised text-muted',
              'transition-[transform,color,border-color] duration-200 ease-out',
              dragging && 'scale-110 border-accent text-accent',
            )}
          >
            <AudioLines className="size-6" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-base font-medium">
              {dragging ? t.track.dropActive : t.track.dropTitle}
            </p>
            <p className="text-xs text-subtle">{t.track.dropHint}</p>
          </div>
          <Button variant="primary" size="lg" onClick={open}>
            <Upload aria-hidden />
            {t.track.choose}
          </Button>
          {rejected && (
            <p role="alert" className="text-xs text-danger">
              {t.track.rejected(rejected)}
            </p>
          )}
        </div>
      )}
    </Dropzone>
  )
}
