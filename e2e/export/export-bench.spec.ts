import { expect, test } from '@playwright/test'

/**
 * Export speed benchmark on dev/export.html (short clips only — long exports need the user's OK).
 * Run: E2E_BASE_URL=http://localhost:5179 npx playwright test e2e/export
 * Optional EXPORT_BENCH_CASES='[{"renderer":"scene","durationSec":10}]' to override the cases.
 */

interface Case {
  renderer?: 'test' | 'scene'
  container?: 'mp4' | 'webm'
  width?: number
  height?: number
  fps?: 24 | 30 | 60
  durationSec?: number
  preferHardware?: boolean
  worker?: boolean
}

const DEFAULT_CASES: Case[] = [
  { renderer: 'test' },
  { renderer: 'scene' },
  { renderer: 'scene', worker: true },
]

const cases: Case[] = process.env.EXPORT_BENCH_CASES
  ? (JSON.parse(process.env.EXPORT_BENCH_CASES) as Case[])
  : DEFAULT_CASES

test('export speed', async ({ page }) => {
  await page.goto('/dev/export.html')
  await page.waitForFunction(() => 'runExport' in window)

  for (const c of cases) {
    const params = {
      container: 'mp4',
      width: 1080,
      height: 1920,
      fps: 30,
      durationSec: 10,
      preferHardware: true,
      renderer: 'test',
      ...c,
    }
    const summary = await page.evaluate(async (p) => {
      const run = (window as unknown as { runExport(p: unknown): Promise<Record<string, unknown>> })
        .runExport
      // UI responsiveness: requestAnimationFrame gaps on the page's main thread during the export.
      const gaps: number[] = []
      let last = performance.now()
      let ticking = true
      const tick = (now: number) => {
        gaps.push(now - last)
        last = now
        if (ticking) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      const r = await run(p).finally(() => {
        ticking = false
      })
      gaps.sort((a, b) => a - b)
      const pct = (q: number) => Number((gaps[Math.floor(q * (gaps.length - 1))] ?? 0).toFixed(1))
      const frames = r.frames as number
      const phases = r.phasesMs as Record<string, number>
      return {
        codec: r.codec,
        hardware: r.hardware,
        framesPerSec: Number((r.framesPerSec as number).toFixed(1)),
        realtime: Number((r.realtimeFactor as number).toFixed(2)),
        uiFrameMs: { p50: pct(0.5), p95: pct(0.95), max: pct(1) },
        msPerFrame: Object.fromEntries(
          Object.entries(phases).map(([k, v]) => [k, Number((v / frames).toFixed(2))]),
        ),
      }
    }, params)
    console.log(JSON.stringify({ case: c, ...summary }))
    expect(summary.framesPerSec).toBeGreaterThan(0)
  }
})
