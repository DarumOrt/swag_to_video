import { frameCountFor, type FrameRate, type VideoContainer } from '@/shared'
import { Panel, Segmented, Select, type SegmentedOption, type SelectOption } from '@/ui'
import { t } from '../i18n'
import {
  SHORT_SIDES,
  SHORT_SIDE_LABELS,
  UI_ASPECTS,
  nearestShortSide,
  sizeFor,
  withAspect,
  withShortSide,
  type UiAspect,
} from '../output'
import { useAppStore } from '../store'

const FPS_OPTIONS: SegmentedOption<FrameRate>[] = [
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
]

const CONTAINER_OPTIONS: SegmentedOption<VideoContainer>[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'webm', label: 'WebM' },
]

const ASPECT_OPTIONS: SegmentedOption<UiAspect>[] = UI_ASPECTS.map((aspect) => ({
  value: aspect,
  title: `${aspect} — ${t.output.aspects[aspect]}`,
  label: (
    <>
      <AspectIcon aspect={aspect} />
      {aspect}
    </>
  ),
}))

export function OutputPanel() {
  const output = useAppStore((state) => state.output)
  const setOutput = useAppStore((state) => state.setOutput)
  const duration = useAppStore((state) => state.timeline?.audio.durationSec ?? null)
  const locked = useAppStore((state) => state.export.status === 'running')
  const aspect: UiAspect = output.aspect === 'custom' ? '9:16' : output.aspect

  const resolutionOptions: SelectOption<string>[] = SHORT_SIDES.map((side) => {
    const size = sizeFor(aspect, side)
    return {
      value: String(side),
      label: SHORT_SIDE_LABELS[side],
      hint: `${size.width}×${size.height}`,
    }
  })

  return (
    <Panel>
      <Segmented
        label={t.output.aspect}
        value={aspect}
        options={ASPECT_OPTIONS}
        onChange={(next) => setOutput(withAspect(output, next))}
        disabled={locked}
      />
      <p className="-mt-1.5 text-2xs text-subtle">{t.output.aspects[aspect]}</p>
      <Select
        label={t.output.resolution}
        value={String(nearestShortSide(output))}
        options={resolutionOptions}
        onChange={(side) => setOutput(withShortSide(output, Number(side)))}
        disabled={locked}
      />
      <div className="grid grid-cols-2 gap-3">
        <Segmented
          label={t.output.fps}
          value={output.fps}
          options={FPS_OPTIONS}
          onChange={(fps) => setOutput({ ...output, fps })}
          disabled={locked}
        />
        <Segmented
          label={t.output.container}
          value={output.container}
          options={CONTAINER_OPTIONS}
          onChange={(container) => setOutput({ ...output, container })}
          disabled={locked}
        />
      </div>
      <dl className="tabular flex items-center justify-between rounded-md bg-bg px-2.5 py-2 font-mono text-2xs">
        <dt className="sr-only">{t.output.summary}</dt>
        <dd className="text-fg">
          {output.width}×{output.height} · {output.fps} fps · {output.container.toUpperCase()}
        </dd>
        {duration !== null && (
          <dd className="text-subtle">{t.output.frames(frameCountFor(duration, output.fps))}</dd>
        )}
      </dl>
    </Panel>
  )
}

/** Small rectangle with the preset's proportions. */
function AspectIcon({ aspect }: { aspect: UiAspect }) {
  const { width, height } = sizeFor(aspect, 1080)
  const scale = 12 / Math.max(width, height)
  return (
    <span aria-hidden className="flex size-3 items-center justify-center">
      <span
        className="rounded-[1.5px] border-[1.5px] border-current"
        style={{ width: width * scale, height: height * scale }}
      />
    </span>
  )
}
