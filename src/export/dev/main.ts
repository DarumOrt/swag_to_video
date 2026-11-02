/**
 * Dev page for export: dev/export.html. Not part of the production build.
 * Also exposes `window.runExport(params)` for scripted benchmarks.
 */

import { analyzeAudio } from '@/audio'
import { createFakeTimeline, SceneRenderer } from '@/render'
import {
  DEFAULT_OUTPUT,
  TIMELINE_SCHEMA_VERSION,
  type Timeline,
  type FrameRate,
  type OutputSettings,
  type VideoContainer,
} from '@/shared'
import {
  checkExportSupport,
  exportVideo,
  exportVideoInWorker,
  pickSaveTarget,
  type ExportProgress,
  type ExportResult,
  type PcmAudio,
  type ResolvedExportConfig,
} from '../index'
import { stubTimeline } from './stubTimeline'
import { syntheticAudio } from './syntheticAudio'
import { TestFrameRenderer } from './testRenderer'

interface RunParams {
  container: VideoContainer
  width: number
  height: number
  fps: FrameRate
  durationSec: number
  preferHardware: boolean
  transparent?: boolean
  /** Stream into a picked file ('file') or OPFS ('opfs') instead of an in-memory Blob. */
  save?: 'file' | 'opfs'
  /** Run in the export worker (always SceneRenderer). */
  worker?: boolean
  /** 'test' = TestFrameRenderer (cheap), 'scene' = the real SceneRenderer with the default scene. */
  renderer?: 'test' | 'scene'
  /** URL of a real track (e.g. /test-media/x.mp3): analyzed with @/audio, exported with SceneRenderer. */
  track?: string
  /** Encoder tuning experiments: patched into the resolved VideoEncoderConfig. */
  encoder?: Partial<VideoEncoderConfig>
}

/** Analyzed real tracks, cached by URL so repeated benchmark runs skip decoding. */
const trackCache = new Map<string, { timeline: Timeline; pcm: PcmAudio }>()

async function loadTrack(url: string) {
  const cached = trackCache.get(url)
  if (cached) return cached
  const blob = await fetch(url).then((r) => r.blob())
  const { analysis, pcm } = await analyzeAudio(blob)
  const timeline: Timeline = {
    version: TIMELINE_SCHEMA_VERSION,
    audio: analysis,
    lyrics: null,
    accents: [],
  }
  const loaded = { timeline, pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels } }
  trackCache.set(url, loaded)
  return loaded
}

type RunSummary = ExportResult['stats'] & {
  save: string
  worker: boolean
  codec: string
  hardware: boolean
  url: string | null
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const log = (text: string) => {
  $('log').textContent = text
}

function readParams(): RunParams {
  const [w, h] = $<HTMLSelectElement>('size').value.split('x').map(Number)
  return {
    container: $<HTMLSelectElement>('container').value as VideoContainer,
    width: w ?? 1080,
    height: h ?? 1920,
    fps: Number($<HTMLSelectElement>('fps').value) as FrameRate,
    durationSec: Number($<HTMLInputElement>('duration').value),
    preferHardware: $<HTMLInputElement>('hw').checked,
    transparent: $<HTMLInputElement>('transparent').checked,
    save: ($<HTMLSelectElement>('save').value || undefined) as RunParams['save'],
    worker: $<HTMLInputElement>('worker').checked,
    renderer: $<HTMLSelectElement>('renderer').value as 'test' | 'scene',
  }
}

function toOutput(p: RunParams): OutputSettings {
  return {
    ...DEFAULT_OUTPUT,
    aspect: 'custom',
    width: p.width,
    height: p.height,
    fps: p.fps,
    container: p.container,
    transparent: p.transparent ?? false,
  }
}

let controller: AbortController | null = null

async function runExport(p: RunParams): Promise<RunSummary> {
  controller = new AbortController()
  $<HTMLButtonElement>('cancel').disabled = false
  $<HTMLButtonElement>('run').disabled = true
  const progressEl = $<HTMLProgressElement>('progress')
  try {
    // First await of the click handler: the file picker needs the user gesture.
    const save = p.save
      ? await pickSaveTarget(`export-${p.width}x${p.height}-${p.fps}`, p.container, {
          prefer: p.save,
        })
      : null
    const track = p.track ? await loadTrack(p.track) : null
    let tuned: ResolvedExportConfig | undefined
    if (p.encoder) {
      const audioSpec = track
        ? { sampleRate: track.pcm.sampleRate, numberOfChannels: track.pcm.channels.length }
        : { sampleRate: 48_000, numberOfChannels: 2 }
      const support = await checkExportSupport(toOutput(p), audioSpec, {
        preferHardware: p.preferHardware,
      })
      if (!support.ok) throw new Error(support.reason)
      tuned = support.config
      tuned.video.config = { ...tuned.video.config, ...p.encoder }
    }
    const common = {
      timeline:
        track?.timeline ??
        (p.renderer === 'scene'
          ? createFakeTimeline({ durationSec: p.durationSec })
          : stubTimeline(p.durationSec)),
      scene: null,
      output: toOutput(p),
      audio: track?.pcm ?? syntheticAudio(p.durationSec),
      durationSec: p.durationSec,
      preferHardware: p.preferHardware,
      config: tuned,
      file: save?.file ?? null,
      signal: controller.signal,
      onProgress: (pr: ExportProgress) => {
        progressEl.value = pr.fraction
        $('status').textContent =
          `${pr.frame}/${pr.totalFrames} · ${pr.framesPerSec.toFixed(1)} кадр/с · ` +
          `осталось ${pr.etaSec === null ? '…' : `${pr.etaSec.toFixed(1)} с`}`
      },
    }
    // The worker always renders with SceneRenderer.
    const result = p.worker
      ? await exportVideoInWorker(common)
      : await exportVideo({
          ...common,
          renderer: p.renderer === 'scene' || track ? new SceneRenderer() : new TestFrameRenderer(),
        })

    const { stats, config } = result
    const row = document.createElement('tr')
    const cells = [
      p.container,
      `${p.width}×${p.height}`,
      p.fps,
      config.video.config.codec + (config.audio ? ` + ${config.audio.config.codec}` : ''),
      config.video.hardware ? 'да' : 'нет',
      stats.durationSec.toFixed(1),
      stats.elapsedSec.toFixed(2),
      stats.framesPerSec.toFixed(1),
      stats.realtimeFactor.toFixed(2),
      (stats.bytes / 1e6).toFixed(1),
    ]
    for (const c of cells) {
      const td = document.createElement('td')
      td.textContent = String(c)
      row.append(td)
    }
    const cell = document.createElement('td')
    let url: string | null = null
    const fileBlob = save?.kind === 'opfs' ? await save.file!.getFile() : result.blob
    if (fileBlob) {
      url = URL.createObjectURL(fileBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export-${p.width}x${p.height}-${p.fps}${result.fileExtension}`
      a.textContent = 'скачать'
      cell.append(a)
      $<HTMLVideoElement>('video').src = url
    } else {
      cell.textContent = `записано в ${save?.name}`
    }
    row.append(cell)
    $('results').append(row)
    log(`Готово: ${result.mimeType}`)
    return {
      ...stats,
      save: save?.kind ?? 'memory',
      worker: !!p.worker,
      codec: config.video.config.codec,
      hardware: config.video.hardware,
      url,
    }
  } catch (error) {
    log(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    throw error
  } finally {
    controller = null
    $<HTMLButtonElement>('cancel').disabled = true
    $<HTMLButtonElement>('run').disabled = false
  }
}

$('run').addEventListener('click', () => void runExport(readParams()).catch(() => {}))
$('cancel').addEventListener('click', () => controller?.abort())
$('check').addEventListener('click', async () => {
  const p = readParams()
  const support = await checkExportSupport(
    toOutput(p),
    { sampleRate: 48_000, numberOfChannels: 2 },
    { preferHardware: p.preferHardware },
  )
  const shown = support.ok ? { video: support.config.video, audio: support.config.audio } : support
  log(JSON.stringify(shown, null, 2))
})

Object.assign(window, { runExport })
