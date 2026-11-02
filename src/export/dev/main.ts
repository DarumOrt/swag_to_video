/**
 * Dev page for export: dev/export.html. Not part of the production build.
 * Also exposes `window.runExport(params)` for scripted benchmarks.
 */

import { DEFAULT_OUTPUT, type FrameRate, type OutputSettings, type VideoContainer } from '@/shared'
import { checkExportSupport, exportVideo, type ExportResult } from '../index'
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
  /** Ask for a file and stream into it (File System Access). */
  stream?: boolean
}

type RunSummary = ExportResult['stats'] & { codec: string; hardware: boolean; url: string | null }

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
    stream: $<HTMLInputElement>('stream').checked,
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
    let writable: FileSystemWritableFileStream | undefined
    if (p.stream) {
      const picker = window as unknown as {
        showSaveFilePicker(o: object): Promise<FileSystemFileHandle>
      }
      const handle = await picker.showSaveFilePicker({
        suggestedName: `export-test.${p.container}`,
      })
      writable = await handle.createWritable()
    }
    const result = await exportVideo({
      renderer: new TestFrameRenderer(),
      timeline: stubTimeline(p.durationSec),
      scene: null,
      output: toOutput(p),
      audio: syntheticAudio(p.durationSec),
      durationSec: p.durationSec,
      preferHardware: p.preferHardware,
      writable,
      signal: controller.signal,
      onProgress: (pr) => {
        progressEl.value = pr.fraction
        $('status').textContent =
          `${pr.frame}/${pr.totalFrames} · ${pr.framesPerSec.toFixed(1)} кадр/с · ` +
          `осталось ${pr.etaSec === null ? '…' : `${pr.etaSec.toFixed(1)} с`}`
      },
    })
    if (writable) await writable.close()

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
    if (result.blob) {
      url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export-${p.width}x${p.height}-${p.fps}${result.fileExtension}`
      a.textContent = 'скачать'
      cell.append(a)
      $<HTMLVideoElement>('video').src = url
    } else {
      cell.textContent = 'записано'
    }
    row.append(cell)
    $('results').append(row)
    log(`Готово: ${result.mimeType}`)
    return { ...stats, codec: config.video.config.codec, hardware: config.video.hardware, url }
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
