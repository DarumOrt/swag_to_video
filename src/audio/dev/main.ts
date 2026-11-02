/** Dev page dev/audio.html: analyze a file, draw the timeline, follow playback live. */
import { analyzeAudio, LUFS_FLOOR, type AnalyzeAudioResult, type DecodedAudio } from '@/audio'
import { featureIndexAt, type AudioAnalysis } from '@/shared'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const fileInput = $<HTMLInputElement>('file')
const mono16kInput = $<HTMLInputElement>('mono16k')
const cancelButton = $<HTMLButtonElement>('cancel')
const rerunButton = $<HTMLButtonElement>('rerun')
const stats = $<HTMLParagraphElement>('stats')
const log = $<HTMLDivElement>('log')
const audio = $<HTMLAudioElement>('audio')
const overview = $<HTMLCanvasElement>('overview')
const live = $<HTMLCanvasElement>('live')
const overviewCtx = overview.getContext('2d')!
const liveCtx = live.getContext('2d')!

let controller: AbortController | null = null
let current: AnalyzeAudioResult | null = null
let background: ImageBitmap | null = null

function print(line: string) {
  log.textContent = `${line}\n${log.textContent ?? ''}`
}

async function run(input: File | DecodedAudio) {
  controller?.abort()
  controller = new AbortController()
  cancelButton.disabled = false
  rerunButton.disabled = true
  const started = performance.now()
  const marks: string[] = []
  let stage = ''
  let stageStart = started
  try {
    const result = await analyzeAudio(input, {
      signal: controller.signal,
      mono16k: mono16kInput.checked,
      onProgress: (p) => {
        if (p.stage !== stage) {
          if (stage) marks.push(`${stage} ${Math.round(performance.now() - stageStart)} мс`)
          stage = p.stage
          stageStart = performance.now()
        }
        stats.textContent = `${p.stage}: ${Math.round(p.fraction * 100)}%`
      },
    })
    marks.push(`${stage} ${Math.round(performance.now() - stageStart)} мс`)
    const total = Math.round(performance.now() - started)
    if (current && !(input instanceof File)) {
      print(
        sameAnalysis(current.analysis, result.analysis)
          ? 'Детерминизм: совпало'
          : 'Детерминизм: РАЗЛИЧИЕ!',
      )
    }
    current = result
    showSummary(result, total, marks)
    await drawOverview(result.analysis)
    rerunButton.disabled = false
  } catch (error) {
    stats.textContent =
      error instanceof DOMException && error.name === 'AbortError' ? 'Отменено' : String(error)
  } finally {
    cancelButton.disabled = true
  }
}

function showSummary(result: AnalyzeAudioResult, totalMs: number, marks: string[]) {
  const a = result.analysis
  const r = a.rhythm
  stats.textContent = [
    `${a.durationSec.toFixed(1)} с · ${a.sampleRate} Гц · ${a.channelCount} кан. · кадров ${a.features.frameCount} @ ${a.features.rate}`,
    `BPM ${r.bpm ?? '—'} · битов ${r.beats.length} · даунбитов ${r.downbeats.length} · onsets ${r.onsets.length} · vocal onsets ${r.vocalOnsets.length} · участков вокала ${a.vocalActivity.length}`,
    `время ${totalMs} мс (${marks.join(', ')})${result.mono16k ? ` · 16 кГц: ${result.mono16k.length} сэмплов` : ''}`,
  ].join('\n')
}

function sameAnalysis(a: AudioAnalysis, b: AudioAnalysis): boolean {
  const flat = (x: AudioAnalysis) => [
    x.features.spectrum.data,
    x.features.rms,
    x.features.peak,
    x.features.lufsShortTerm,
    x.features.bands.low,
    x.features.bands.mid,
    x.features.bands.high,
    x.features.stereo.correlation,
    x.features.stereo.width,
    x.rhythm.beats,
    x.rhythm.downbeats,
    x.rhythm.onsets,
    x.rhythm.vocalOnsets,
  ]
  const fa = flat(a)
  const fb = flat(b)
  return (
    a.rhythm.bpm === b.rhythm.bpm &&
    JSON.stringify(a.vocalActivity) === JSON.stringify(b.vocalActivity) &&
    fa.every((array, i) => {
      const other = fb[i]!
      return array.length === other.length && array.every((v, k) => Object.is(v, other[k]))
    })
  )
}

// Layout of the overview canvas (y ranges).
const SPEC = { top: 0, height: 240 }
const LANES = { top: 250, height: 200 }
const MARKS = { top: 460, height: 60 }

function heat(v: number): string {
  const h = 260 - 260 * v
  return `hsl(${h} 90% ${Math.min(60, 5 + v * 70)}%)`
}

async function drawOverview(a: AudioAnalysis) {
  const { width } = overview
  const f = a.features
  const ctx = overviewCtx
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, overview.height)
  if (f.frameCount === 0) return
  const framesPerPx = f.frameCount / width
  const bins = f.spectrum.binCount
  const binHeight = SPEC.height / bins

  for (let x = 0; x < width; x++) {
    const from = Math.floor(x * framesPerPx)
    const to = Math.max(from + 1, Math.floor((x + 1) * framesPerPx))
    for (let b = 0; b < bins; b++) {
      let v = 0
      for (let i = from; i < to && i < f.frameCount; i++)
        v = Math.max(v, f.spectrum.data[i * bins + b]!)
      ctx.fillStyle = heat(v)
      ctx.fillRect(x, SPEC.top + SPEC.height - (b + 1) * binHeight, 1, Math.ceil(binHeight))
    }
  }

  const lane = (values: Float32Array, color: string, map: (v: number) => number) => {
    ctx.strokeStyle = color
    ctx.beginPath()
    for (let x = 0; x < width; x++) {
      const from = Math.floor(x * framesPerPx)
      const to = Math.max(from + 1, Math.floor((x + 1) * framesPerPx))
      let v = -Infinity
      for (let i = from; i < to && i < f.frameCount; i++) v = Math.max(v, values[i]!)
      const y = LANES.top + LANES.height * (1 - Math.min(1, Math.max(0, map(v))))
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  ctx.lineWidth = 1
  lane(f.peak, '#fff', (v) => v)
  lane(f.rms, '#4ade80', (v) => v)
  lane(f.lufsShortTerm, '#facc15', (v) => (v - LUFS_FLOOR) / -LUFS_FLOOR)
  lane(f.bands.low, '#f87171', (v) => v)
  lane(f.bands.mid, '#60a5fa', (v) => v)
  lane(f.bands.high, '#c084fc', (v) => v)

  const toX = (t: number) => (t / a.durationSec) * width
  ctx.fillStyle = 'rgba(163, 230, 53, 0.6)'
  for (const r of a.vocalActivity)
    ctx.fillRect(toX(r.start), MARKS.top, toX(r.end) - toX(r.start), 6)
  const ticks = (times: Float32Array, color: string, y: number, h: number) => {
    ctx.fillStyle = color
    for (const t of times) ctx.fillRect(Math.round(toX(t)), y, 1, h)
  }
  ticks(a.rhythm.beats, '#f472b6', MARKS.top + 10, 14)
  ticks(a.rhythm.downbeats, '#f472b6', MARKS.top + 8, 18)
  ticks(a.rhythm.onsets, '#fb923c', MARKS.top + 30, 12)
  ticks(a.rhythm.vocalOnsets, '#22d3ee', MARKS.top + 45, 12)

  background = await createImageBitmap(overview)
}

function nearDistance(times: Float32Array, t: number): number {
  // Binary search for the closest time.
  let lo = 0
  let hi = times.length - 1
  if (hi < 0) return Infinity
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid]! < t) lo = mid + 1
    else hi = mid
  }
  const a = Math.abs(times[lo]! - t)
  const b = lo > 0 ? Math.abs(times[lo - 1]! - t) : Infinity
  return Math.min(a, b)
}

function drawLive() {
  requestAnimationFrame(drawLive)
  const result = current
  if (!result) return
  const a = result.analysis
  const f = a.features
  const t = audio.currentTime

  if (background) {
    overviewCtx.drawImage(background, 0, 0)
    const x = (t / a.durationSec) * overview.width
    overviewCtx.fillStyle = '#fff'
    overviewCtx.fillRect(Math.round(x), 0, 1, overview.height)
  }

  const ctx = liveCtx
  const { width, height } = live
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  if (f.frameCount === 0) return
  const i = featureIndexAt(f, t)
  const bins = f.spectrum.binCount
  const specWidth = 760
  const barWidth = specWidth / bins
  for (let b = 0; b < bins; b++) {
    const v = f.spectrum.data[i * bins + b]!
    ctx.fillStyle = heat(v)
    ctx.fillRect(b * barWidth, height - v * height, Math.max(1, barWidth - 1), v * height)
  }

  const meters: [string, number, string][] = [
    ['peak', f.peak[i]!, '#fff'],
    ['rms', f.rms[i]!, '#4ade80'],
    ['LUFS', (f.lufsShortTerm[i]! - LUFS_FLOOR) / -LUFS_FLOOR, '#facc15'],
    ['low', f.bands.low[i]!, '#f87171'],
    ['mid', f.bands.mid[i]!, '#60a5fa'],
    ['high', f.bands.high[i]!, '#c084fc'],
    ['width', f.stereo.width[i]!, '#94a3b8'],
  ]
  meters.forEach(([label, v, color], k) => {
    const x = specWidth + 20 + k * 40
    ctx.fillStyle = color
    ctx.fillRect(x, height - 20 - v * (height - 40), 28, v * (height - 40))
    ctx.fillStyle = '#aaa'
    ctx.font = '11px system-ui'
    ctx.fillText(label, x, height - 6)
  })

  const beatHit = nearDistance(a.rhythm.beats, t) < 0.05
  const onsetHit = nearDistance(a.rhythm.onsets, t) < 0.04
  const vocalHit = nearDistance(a.rhythm.vocalOnsets, t) < 0.04
  const vocal = a.vocalActivity.some((r) => t >= r.start && t <= r.end)
  const lamps: [string, boolean, string][] = [
    ['beat', beatHit, '#f472b6'],
    ['onset', onsetHit, '#fb923c'],
    ['vocal onset', vocalHit, '#22d3ee'],
    ['вокал', vocal, '#a3e635'],
  ]
  ctx.font = '12px system-ui'
  lamps.forEach(([label, on, color], k) => {
    ctx.fillStyle = on ? color : '#333'
    ctx.fillRect(specWidth + 20 + k * 100, 12, 90, 24)
    ctx.fillStyle = on ? '#000' : '#888'
    ctx.fillText(label, specWidth + 26 + k * 100, 29)
  })
  ctx.fillStyle = '#9cf'
  ctx.fillText(
    `t ${t.toFixed(2)} · кадр ${i} · LUFS ${f.lufsShortTerm[i]!.toFixed(1)} · corr ${f.stereo.correlation[i]!.toFixed(2)}`,
    specWidth + 20,
    58,
  )
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return
  audio.src = URL.createObjectURL(file)
  current = null
  background = null
  void run(file)
})
cancelButton.addEventListener('click', () => controller?.abort())
rerunButton.addEventListener('click', () => {
  if (current) void run(current.pcm)
})
overview.addEventListener('click', (event) => {
  if (!current) return
  const rect = overview.getBoundingClientRect()
  audio.currentTime = ((event.clientX - rect.left) / rect.width) * current.analysis.durationSec
})

requestAnimationFrame(drawLive)
