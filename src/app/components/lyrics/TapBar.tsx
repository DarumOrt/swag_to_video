import { Check, Undo2, X } from 'lucide-react'
import { useEffect } from 'react'
import type { TapMode, TapSession } from '@/lyrics'
import { Button, Segmented, type SegmentedOption } from '@/ui'
import { t } from '../../i18n'
import { setTapMode, startTapSync, stopTapSync, tapDown, tapUndo, tapUp } from '../../lyricsActions'
import { useLyricsStore } from '../../lyricsStore'

const MODE_OPTIONS: SegmentedOption<TapMode>[] = [
  { value: 'line', label: t.lyrics.tap.modeLine },
  { value: 'word', label: t.lyrics.tap.modeWord },
]

/** Tap-sync controls. While mounted it owns Space / Backspace / Enter / Esc. */
export function TapBar({ session }: { session: TapSession }) {
  const mode = useLyricsStore((state) => state.tapMode)
  const done = session.taps.length
  const total = session.unitIds.length

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === 'Space') {
        event.preventDefault()
        if (!event.repeat) tapDown()
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        tapUndo()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        stopTapSync(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        stopTapSync(false)
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code !== 'Space') return
      // Also stops a focused button from activating on Space release.
      event.preventDefault()
      tapUp()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [])

  return (
    <div
      role="region"
      aria-label={t.lyrics.tap.title}
      className="flex shrink-0 flex-col gap-3 border-b border-line bg-accent-soft/40 p-4"
    >
      <div className="flex items-center gap-3">
        <Segmented
          label={t.lyrics.tap.modeLabel}
          hideLabel
          value={mode}
          options={MODE_OPTIONS}
          disabled={done > 0}
          onChange={(next) => {
            setTapMode(next)
            startTapSync()
          }}
          className="w-40"
        />
        <span className="tabular ml-auto font-mono text-sm text-fg" aria-live="polite">
          {t.lyrics.tap.progress(done, total)}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line-strong">
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-150 ease-out"
          style={{ transform: `scaleX(${total ? done / total : 0})` }}
        />
      </div>
      <p className="text-xs text-fg">
        {mode === 'line' ? t.lyrics.tap.hintLine : t.lyrics.tap.hintWord}
      </p>
      <p className="-mt-2 text-2xs text-subtle">{t.lyrics.tap.keys}</p>
      <div className="flex items-center gap-1">
        <Button variant="primary" size="sm" onClick={() => stopTapSync(true)} disabled={!done}>
          <Check aria-hidden />
          {t.lyrics.tap.done}
        </Button>
        <Button size="sm" variant="ghost" onClick={tapUndo} disabled={!done}>
          <Undo2 aria-hidden />
          {t.lyrics.tap.undo}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => stopTapSync(false)}
          title={t.lyrics.tap.cancel}
          aria-label={t.lyrics.tap.cancel}
        >
          <X />
        </Button>
      </div>
    </div>
  )
}
