import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Button, Slider } from '@/ui'
import { formatTime } from '../format'
import { t } from '../i18n'
import { playback } from '../playback'
import { useAppStore } from '../store'

export function Transport() {
  const duration = useAppStore(
    (state) => state.timeline?.audio.durationSec ?? state.track?.durationSec ?? 0,
  )
  const hasTrack = useAppStore((state) => state.track !== null)
  const isPlaying = useAppStore((state) => state.isPlaying)
  const exporting = useAppStore((state) => state.export.status === 'running')
  const disabled = !hasTrack || exporting

  const timeRef = useRef<HTMLSpanElement>(null)
  const scrubRef = useRef<HTMLInputElement>(null)

  // Playhead → DOM, bypassing React.
  useEffect(
    () =>
      playback.subscribe((time) => {
        if (timeRef.current) timeRef.current.textContent = formatTime(time, true)
        const scrub = scrubRef.current
        if (scrub) {
          scrub.value = String(time)
          const progress = duration > 0 ? (time / duration) * 100 : 0
          scrub.style.setProperty('--range-progress', `${progress}%`)
          scrub.setAttribute('aria-valuetext', formatTime(time))
        }
      }),
    [duration],
  )

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-t border-line bg-surface px-4">
      <Button
        variant="primary"
        size="icon-lg"
        disabled={disabled}
        onClick={() => playback.toggle()}
        aria-label={isPlaying ? t.player.pause : t.player.play}
        title={`${isPlaying ? t.player.pause : t.player.play} (${t.player.shortcuts})`}
      >
        {isPlaying ? (
          <Pause fill="currentColor" />
        ) : (
          <Play fill="currentColor" className="ml-0.5" />
        )}
      </Button>

      <div className="tabular flex shrink-0 items-baseline gap-1 font-mono text-xs">
        <span ref={timeRef} className="inline-block w-[7ch] text-right text-fg">
          0:00.0
        </span>
        <span className="text-subtle">/</span>
        <span className="text-muted">{formatTime(duration)}</span>
      </div>

      <input
        ref={scrubRef}
        type="range"
        aria-label={t.player.seek}
        className="range min-w-0 flex-1"
        min={0}
        max={duration || 1}
        step={0.01}
        defaultValue={0}
        disabled={disabled || duration === 0}
        onInput={(event) => playback.seek(Number(event.currentTarget.value))}
      />

      <VolumeControl />
    </div>
  )
}

function VolumeControl() {
  const volume = useAppStore((state) => state.volume)
  const muted = useAppStore((state) => state.muted)
  const setVolume = useAppStore((state) => state.setVolume)
  const setMuted = useAppStore((state) => state.setMuted)

  useEffect(() => playback.setVolume(volume, muted), [volume, muted])

  const silent = muted || volume === 0
  return (
    <div className="hidden w-36 shrink-0 items-center gap-1 md:flex">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMuted(!muted)}
        aria-label={silent ? t.player.unmute : t.player.mute}
        title={silent ? t.player.unmute : t.player.mute}
      >
        {silent ? <VolumeX /> : <Volume2 />}
      </Button>
      <Slider
        label={t.player.volume}
        hideLabel
        value={muted ? 0 : volume}
        onChange={setVolume}
        format={(value) => `${Math.round(value * 100)}%`}
        className="flex-1"
      />
    </div>
  )
}
