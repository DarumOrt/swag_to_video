/**
 * Dev page dev/ml.html: load a Whisper variant, recognize a track, compare runs.
 * Also exposes `window.mlBench` so runs can be scripted from the console.
 */
import {
  DTYPE_PRESETS,
  WHISPER_MODELS,
  WhisperClient,
  WHISPER_SAMPLE_RATE,
  defaultDtypes,
  deleteCachedModel,
  listCachedModels,
  requestPersistentStorage,
  toMono16k,
  type LoadStats,
  type TranscribeResult,
  type WhisperDevice,
  type WhisperModelId,
} from '@/ml'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const modelSelect = $<HTMLSelectElement>('model')
const deviceSelect = $<HTMLSelectElement>('device')
const dtypeSelect = $<HTMLSelectElement>('dtype')
const langSelect = $<HTMLSelectElement>('lang')

for (const [id, m] of Object.entries(WHISPER_MODELS)) modelSelect.add(new Option(m.label, id))
modelSelect.value = 'whisper-small-timestamped'
dtypeSelect.add(new Option('по умолчанию для устройства', ''))
for (const name of Object.keys(DTYPE_PRESETS)) dtypeSelect.add(new Option(name, name))
if (!('gpu' in navigator)) deviceSelect.value = 'wasm'

let client = new WhisperClient()
let loaded: { key: string; stats: LoadStats } | null = null
let audio: Float32Array | null = null
let audioName = ''

interface RunRow {
  model: string
  device: string
  dtype: string
  track: string
  load: LoadStats
  result: TranscribeResult
}
const runs: RunRow[] = []

function log(...parts: unknown[]) {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
  console.log('[ml]', line)
  $('log').textContent = `${new Date().toLocaleTimeString()} ${line}\n` + $('log').textContent
}

function currentConfig() {
  const device = deviceSelect.value as WhisperDevice
  const dtypeName = dtypeSelect.value
  const dtype = dtypeName ? DTYPE_PRESETS[dtypeName]! : defaultDtypes(device)
  const model = modelSelect.value as WhisperModelId
  const dtypeLabel = `enc ${dtype.encoder_model} / dec ${dtype.decoder_model_merged}`
  return { model, device, dtype, dtypeLabel, key: `${model}|${device}|${dtypeLabel}` }
}

async function load(): Promise<LoadStats> {
  const cfg = currentConfig()
  if (loaded?.key === cfg.key) return loaded.stats
  // A fresh worker per model frees GPU/WASM memory of the previous one.
  client.dispose()
  client = new WhisperClient()
  loaded = null
  await requestPersistentStorage()
  const files = new Map<string, { loaded: number; total: number }>()
  $('loadStatus').textContent = 'загрузка…'
  log('load', cfg.key)
  const stats = await client.load(
    { model: cfg.model, device: cfg.device, dtype: cfg.dtype },
    (p) => {
      files.set(p.file, p)
      let done = 0
      let total = 0
      for (const f of files.values()) {
        done += f.loaded
        total += f.total
      }
      $('loadStatus').textContent = `${(done / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} МБ`
    },
  )
  loaded = { key: cfg.key, stats }
  $('loadStatus').textContent =
    `готово за ${(stats.elapsedMs / 1000).toFixed(1)} с, скачано ${(stats.downloadedBytes / 1e6).toFixed(0)} МБ ` +
    `(${stats.repo}@${stats.revision.slice(0, 8)}${stats.mirrored ? ', зеркало' : ''})`
  log('loaded', stats)
  return stats
}

async function setAudio(source: Blob | ArrayBuffer, name: string) {
  $('audioStatus').textContent = 'декодирование…'
  audio = await toMono16k(source)
  audioName = name
  $('audioStatus').textContent = `${name}: ${(audio.length / WHISPER_SAMPLE_RATE).toFixed(1)} с`
}

async function loadUrl(url: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  await setAudio(await response.arrayBuffer(), decodeURIComponent(url.split('/').pop() ?? url))
}

function clip(): Float32Array {
  if (!audio) throw new Error('нет аудио')
  const from = Math.max(0, Number($<HTMLInputElement>('from').value) || 0)
  const len = Number($<HTMLInputElement>('len').value) || 0
  const start = Math.round(from * WHISPER_SAMPLE_RATE)
  const end =
    len > 0 ? Math.min(audio.length, start + Math.round(len * WHISPER_SAMPLE_RATE)) : audio.length
  return audio.slice(start, end) // copy: the clip is transferred to the worker
}

async function run(): Promise<RunRow> {
  const cfg = currentConfig()
  const loadStats = await load()
  const samples = clip()
  $('runStatus').textContent = 'распознавание…'
  const language = langSelect.value as 'auto' | 'ru' | 'en'
  const result = await client.transcribe(samples, { language }, (done, total) => {
    $('runStatus').textContent = `${done.toFixed(0)} / ${total.toFixed(0)} с`
  })
  const row: RunRow = {
    model: WHISPER_MODELS[cfg.model].label,
    device: cfg.device,
    dtype: cfg.dtypeLabel,
    track: `${audioName} @${$<HTMLInputElement>('from').value}s`,
    load: { ...loadStats },
    result,
  }
  runs.push(row)
  // Download size counts only for the first run of a loaded model.
  loadStats.downloadedBytes = 0
  renderRun(row)
  renderWords(result)
  $('runStatus').textContent = `готово: ${(result.stats.elapsedMs / 1000).toFixed(1)} с`
  log('result', {
    language: result.language,
    stats: result.stats,
    text: result.segments.map((s) => s.text).join(' / '),
  })
  return row
}

function summary(row: RunRow) {
  const { result, load } = row
  const conf = result.words.map((w) => w.confidence).filter((c): c is number => c !== null)
  const flags = result.segments.flatMap((s) => s.flags)
  return {
    model: row.model,
    device: row.device,
    dtype: row.dtype,
    track: row.track,
    language: result.language,
    loadSec: (load.elapsedMs / 1000).toFixed(1),
    downloadedMb: (load.downloadedBytes / 1e6).toFixed(0),
    audioSec: result.stats.audioSec.toFixed(0),
    recogSec: (result.stats.elapsedMs / 1000).toFixed(1),
    secPerMin: ((result.stats.elapsedMs / 1000 / result.stats.audioSec) * 60).toFixed(1),
    words: String(result.words.length),
    meanConf: conf.length ? (conf.reduce((a, b) => a + b, 0) / conf.length).toFixed(2) : '—',
    dropped: String(result.stats.droppedSegments.length),
    flags: [...new Set(flags)].join(',') || '—',
  }
}

function renderRun(row: RunRow) {
  const tr = document.createElement('tr')
  for (const value of Object.values(summary(row))) {
    const td = document.createElement('td')
    td.textContent = value
    tr.append(td)
  }
  $('runs').querySelector('tbody')!.append(tr)
}

function renderWords(result: TranscribeResult) {
  const root = $('words')
  root.textContent = ''
  for (const seg of result.segments) {
    const line = document.createElement('div')
    for (const w of seg.words) {
      const span = document.createElement('span')
      const c = w.confidence ?? 1
      span.className = c < 0.4 ? 'low' : c < 0.7 ? 'mid' : ''
      span.title = `${w.start.toFixed(2)}–${w.end.toFixed(2)} conf ${w.confidence ?? '—'}`
      span.innerHTML = `${escapeHtml(w.text)} <small>${w.start.toFixed(1)}</small>`
      line.append(span)
    }
    if (seg.flags.length) line.append(` [${seg.flags.join(',')}]`)
    root.append(line)
  }
}

function escapeHtml(s: string) {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  )
}

function markdown(): string {
  const rows = runs.map(summary)
  if (!rows.length) return ''
  const head = Object.keys(rows[0]!)
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${Object.values(r).join(' | ')} |`),
  ].join('\n')
}

const guard = (fn: () => Promise<unknown>) => () =>
  fn().catch((error: unknown) => {
    log('error', error instanceof Error ? error.message : String(error))
    $('runStatus').textContent = 'ошибка — см. лог'
  })

$('load').onclick = guard(load)
$('run').onclick = guard(run)
$('cancel').onclick = () => client.cancel()
$('sample').onclick = guard(() =>
  loadUrl('https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav'),
)
$<HTMLInputElement>('file').onchange = guard(async () => {
  const file = $<HTMLInputElement>('file').files?.[0]
  if (file) await setAudio(file, file.name)
})
$<HTMLInputElement>('url').onchange = guard(() => loadUrl($<HTMLInputElement>('url').value))
$('copy').onclick = () => void navigator.clipboard.writeText(markdown())
$('cacheList').onclick = guard(async () => {
  const repos = await listCachedModels()
  const status = $('cacheStatus')
  status.textContent = repos.length ? '' : 'пусто'
  for (const r of repos) {
    const button = document.createElement('button')
    button.textContent = `удалить ${r.repo} (${r.files} файлов, ${(r.bytes / 1e6).toFixed(0)} МБ)`
    button.onclick = guard(async () => {
      await deleteCachedModel(r.repo)
      button.remove()
    })
    status.append(button)
  }
})

/** Console/automation hook: `await mlBench.run({ model, device, dtype, url, from, len, language })`. */
Object.assign(window, {
  mlBench: {
    async run(opts: {
      model?: WhisperModelId
      device?: WhisperDevice
      dtype?: string
      url?: string
      from?: number
      len?: number
      language?: 'auto' | 'ru' | 'en'
    }) {
      if (opts.model) modelSelect.value = opts.model
      if (opts.device) deviceSelect.value = opts.device
      if (opts.dtype !== undefined) dtypeSelect.value = opts.dtype
      if (opts.language) langSelect.value = opts.language
      if (opts.from !== undefined) $<HTMLInputElement>('from').value = String(opts.from)
      if (opts.len !== undefined) $<HTMLInputElement>('len').value = String(opts.len)
      if (opts.url && opts.url !== audioName) await loadUrl(opts.url)
      const row = await run()
      return {
        ...summary(row),
        text: row.result.segments.map((s) => s.text).join(' / '),
        words: row.result.words,
        stats: row.result.stats,
        segmentFlags: row.result.segments.flatMap((s) => s.flags),
      }
    },
    markdown,
    runs,
  },
})
log(
  'ready; crossOriginIsolated =',
  String(crossOriginIsolated),
  '; webgpu =',
  String('gpu' in navigator),
)
