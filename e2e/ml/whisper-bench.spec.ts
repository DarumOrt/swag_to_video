/**
 * Whisper benchmark on real tracks from test-media/ via dev/ml.html (`window.mlBench`).
 *
 *   npm run dev -- --port 5175 --strictPort
 *   E2E_BASE_URL=http://localhost:5175 npx playwright test e2e/ml
 *
 * Env:
 *   ML_BENCH_ONLY     — run only configs whose name contains this substring (e.g. "turbo", "wasm")
 *   ML_BENCH_CLIP     — clip length in seconds (default 60, 0 = whole track from the clip start)
 *   ML_BENCH_OUT      — results JSON (default: <tmp>/swagtovideo-ml-bench.json)
 *   ML_BENCH_PROFILE  — persistent Chrome profile so model downloads are cached between runs
 *                       (default: <tmp>/swagtovideo-ml-bench-profile)
 *
 * A reference lyrics .txt in test-media/ (same base name, or containing the track's match string) enables WER. Lyrics never leave test-media/:
 * the report contains numbers only.
 */
import { chromium, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { werAgainstSpan } from './wer'

const MEDIA = 'test-media'
const OUT = process.env.ML_BENCH_OUT ?? join(tmpdir(), 'swagtovideo-ml-bench.json')
const PROFILE = process.env.ML_BENCH_PROFILE ?? join(tmpdir(), 'swagtovideo-ml-bench-profile')

/** Clip start per track (skip intros); matched by substring of the file name. */
const TRACKS = [
  { match: 'Адская колыбельная', from: 20 },
  { match: 'Another One', from: 30 },
]
const CLIP_SEC = Number(process.env.ML_BENCH_CLIP ?? 60) // 0 = whole track

const CONFIGS = [
  {
    name: 'small wasm q8',
    model: 'whisper-small-timestamped',
    device: 'wasm',
    dtype: 'enc q8 / dec q8',
  },
  {
    name: 'small webgpu fp32/q4',
    model: 'whisper-small-timestamped',
    device: 'webgpu',
    dtype: 'enc fp32 / dec q4',
  },
  {
    name: 'small webgpu fp16/q4f16',
    model: 'whisper-small-timestamped',
    device: 'webgpu',
    dtype: 'enc fp16 / dec q4f16',
  },
  {
    name: 'turbo webgpu q4f16/q4f16',
    model: 'whisper-large-v3-turbo-timestamped',
    device: 'webgpu',
    dtype: 'enc q4f16 / dec q4f16',
  },
] as const

interface BenchWord {
  text: string
  start: number
  end: number
  confidence: number | null
}

interface BenchRun {
  language: string
  loadSec: string
  downloadedMb: string
  recogSec: string
  secPerMin: string
  meanConf: string
  text: string
  words: BenchWord[]
  stats: { retries: number; windows: number; droppedSegments: string[] }
  segmentFlags: string[]
}

function wordChecks(words: BenchWord[]) {
  let nonMonotonic = 0
  for (let i = 1; i < words.length; i++)
    if (words[i]!.start < words[i - 1]!.start - 0.01) nonMonotonic++
  const durations = words.map((w) => w.end - w.start)
  return {
    words: words.length,
    zeroLength: durations.filter((d) => d <= 0.02).length,
    over2s: durations.filter((d) => d > 2).length,
    nonMonotonic,
  }
}

test('whisper benchmark', async ({ baseURL }) => {
  test.setTimeout(3 * 60 * 60_000)
  const files = readdirSync(MEDIA)
  const tracks = TRACKS.flatMap((t) => {
    const file = files.find((f) => f.includes(t.match) && !f.endsWith('.txt'))
    if (!file) return []
    // Reference: same base name, or any .txt containing the track's match string.
    const ref = [
      `${parse(file).name}.txt`,
      ...files.filter((f) => f.endsWith('.txt') && f.includes(t.match)),
    ]
      .map((f) => join(MEDIA, f))
      .find((f) => existsSync(f))
    return [{ ...t, file, reference: ref ? readFileSync(ref, 'utf8') : null }]
  })
  test.skip(tracks.length === 0, 'no test tracks in test-media/')

  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
  })
  const page = context.pages()[0] ?? (await context.newPage())
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[browser error]', m.text())
  })
  await page.goto(new URL('/dev/ml.html', baseURL).href)
  const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu?.requestAdapter()
    return a
      ? {
          vendor: a.info.vendor,
          architecture: a.info.architecture,
          f16: a.features.has('shader-f16'),
        }
      : null
  })
  console.log('WebGPU adapter:', JSON.stringify(adapter))

  const results: Record<string, unknown>[] = []
  const only = process.env.ML_BENCH_ONLY
  for (const config of CONFIGS.filter((c) => !only || c.name.includes(only))) {
    for (const track of tracks) {
      const label = `${config.name} | ${track.match}`
      console.log('run', label)
      let row: Record<string, unknown>
      try {
        const run = await page.evaluate(
          (opts) =>
            (
              window as unknown as { mlBench: { run(o: typeof opts): Promise<BenchRun> } }
            ).mlBench.run(opts),
          {
            model: config.model,
            device: config.device,
            dtype: config.dtype,
            url: `/${MEDIA}/${encodeURIComponent(track.file)}`,
            from: track.from,
            len: CLIP_SEC,
            language: 'auto',
          },
        )
        const wer = track.reference
          ? werAgainstSpan(run.text.replace(/\//g, ' '), track.reference)
          : null
        row = {
          config: config.name,
          track: track.match,
          language: run.language,
          loadSec: run.loadSec,
          downloadedMb: run.downloadedMb,
          recogSec: run.recogSec,
          secPerMin: run.secPerMin,
          meanConf: run.meanConf,
          retries: run.stats.retries,
          dropped: run.stats.droppedSegments.length,
          flags: [...new Set(run.segmentFlags)].join(',') || '—',
          ...wordChecks(run.words),
          wer: wer ? Number(wer.wer.toFixed(3)) : null,
          // Transcript stays in the local results file only (never in the repo or the report).
          text: run.text,
        }
      } catch (error) {
        row = { config: config.name, track: track.match, error: String(error) }
      }
      console.log(JSON.stringify({ ...row, text: undefined }))
      results.push(row)
      writeFileSync(OUT, JSON.stringify({ adapter, results }, null, 2))
    }
  }
  await context.close()
  console.log('results:', OUT)
})
