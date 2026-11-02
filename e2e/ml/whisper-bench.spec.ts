/**
 * Whisper benchmark on real tracks from test-media/ via dev/ml.html (`window.mlBench`).
 *
 * HEAVY: downloads ~250–330 MB per config and runs the model. Per CLAUDE.md rule 11, run it only after
 * the user confirmed the machine is free:
 *
 *   npm run dev -- --port 5175 --strictPort
 *   E2E_BASE_URL=http://localhost:5175 npx playwright test e2e/ml
 *
 * Memory rules: one config per Chrome launch (each config is its own test, Chrome is closed after it);
 * a config is skipped if the machine has less than ML_BENCH_MIN_FREE_GB of free RAM before it starts.
 *
 * Env:
 *   ML_BENCH_ONLY          — run only configs whose name contains this substring (e.g. "wasm")
 *   ML_BENCH_CLIP          — clip length in seconds (default 60)
 *   ML_BENCH_MIN_FREE_GB   — free RAM required before launching Chrome (default 5)
 *   ML_BENCH_OUT           — results JSON (default: <tmp>/swagtovideo-ml-bench.json)
 *   ML_BENCH_PROFILE       — Chrome profile, keeps downloaded models cached between runs
 *                            (default: <tmp>/swagtovideo-ml-bench-profile)
 *
 * WER: a reference lyrics .txt in test-media/ (same base name as the track, or containing the track's
 * match string). Lyrics and transcripts never leave the local machine: the console and the report get
 * numbers only; transcripts go to the local results file.
 */
import { chromium, test } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freemem, tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { werAgainstSpan } from './wer'

const MEDIA = 'test-media'
const OUT = process.env.ML_BENCH_OUT ?? join(tmpdir(), 'swagtovideo-ml-bench.json')
const PROFILE = process.env.ML_BENCH_PROFILE ?? join(tmpdir(), 'swagtovideo-ml-bench-profile')
const CLIP_SEC = Number(process.env.ML_BENCH_CLIP ?? 60)
const MIN_FREE_GB = Number(process.env.ML_BENCH_MIN_FREE_GB ?? 5)

/** Clip start per track (skip intros); matched by substring of the file name. One RU, one EN. */
const TRACKS = [
  { match: 'Адская колыбельная', from: 20 },
  { match: 'Another One', from: 30 },
]

/** The two configs the app actually picks (see src/ml/device.ts). */
const CONFIGS = [
  {
    name: 'small webgpu fp16/q4f16',
    model: 'whisper-small-timestamped',
    device: 'webgpu',
    dtype: 'enc fp16 / dec q4f16',
  },
  {
    name: 'small wasm q8',
    model: 'whisper-small-timestamped',
    device: 'wasm',
    dtype: 'enc q8 / dec q8',
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

function findTracks() {
  const files = existsSync(MEDIA) ? readdirSync(MEDIA) : []
  return TRACKS.flatMap((t) => {
    const file = files.find((f) => f.includes(t.match) && !f.endsWith('.txt'))
    if (!file) return []
    const ref = [
      `${parse(file).name}.txt`,
      ...files.filter((f) => f.endsWith('.txt') && f.includes(t.match)),
    ]
      .map((f) => join(MEDIA, f))
      .find((f) => existsSync(f))
    return [{ ...t, file, reference: ref ? readFileSync(ref, 'utf8') : null }]
  })
}

/** Results of all configs, merged by config + track so separate runs add up. */
function saveRow(row: Record<string, unknown>) {
  const data = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, 'utf8')) as { results: Record<string, unknown>[] })
    : { results: [] }
  data.results = data.results.filter((r) => !(r.config === row.config && r.track === row.track))
  data.results.push(row)
  writeFileSync(OUT, JSON.stringify(data, null, 2))
}

test.describe.configure({ mode: 'serial' })

const only = process.env.ML_BENCH_ONLY
for (const config of CONFIGS.filter((c) => !only || c.name.includes(only))) {
  test(`whisper bench: ${config.name}`, async ({ baseURL }) => {
    test.setTimeout(30 * 60_000)
    const tracks = findTracks()
    test.skip(tracks.length === 0, 'no test tracks in test-media/')
    const freeGb = freemem() / 1024 ** 3
    test.skip(
      freeGb < MIN_FREE_GB,
      `only ${freeGb.toFixed(1)} GB RAM free (< ${MIN_FREE_GB} GB) — not starting Chrome`,
    )

    // A fresh Chrome per config: all model memory is returned to the OS when it closes.
    const context = await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome',
      headless: false,
    })
    try {
      const page = context.pages()[0] ?? (await context.newPage())
      page.on('console', (m) => {
        if (m.type() === 'error') console.log('[browser error]', m.text().slice(0, 300))
      })
      await page.goto(new URL('/dev/ml.html', baseURL).href)
      const adapter = await page.evaluate(async () => {
        const a = await navigator.gpu?.requestAdapter()
        return a
          ? `${a.info.vendor}/${a.info.architecture} f16=${a.features.has('shader-f16')}`
          : null
      })
      console.log(`[${config.name}] free RAM ${freeGb.toFixed(1)} GB, WebGPU adapter: ${adapter}`)

      for (const track of tracks) {
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
            adapter,
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
            werRefWords: wer?.refWords ?? null,
            // Transcript stays in the local results file only (never in the repo or the report).
            text: run.text,
          }
        } catch (error) {
          row = { config: config.name, track: track.match, error: String(error).slice(0, 500) }
        }
        console.log(JSON.stringify({ ...row, text: undefined }))
        saveRow(row)
      }
    } finally {
      await context.close()
    }
    console.log('results:', OUT)
  })
}
