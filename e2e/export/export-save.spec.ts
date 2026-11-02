import { expect, test } from '@playwright/test'

/**
 * Streaming to OPFS (main thread and worker) and cancellation. The native "Save as" picker cannot
 * be driven by Playwright, so the File System Access path shares this code but is checked by hand.
 * Run: E2E_BASE_URL=http://localhost:5179 npx playwright test e2e/export/export-save.spec.ts
 */

type Win = { runExport(p: unknown): Promise<Record<string, unknown>> }

const base = {
  container: 'mp4',
  width: 720,
  height: 1280,
  fps: 30,
  durationSec: 5,
  preferHardware: true,
  renderer: 'scene',
  save: 'opfs',
}

async function opfsExports(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const dir = await root.getDirectoryHandle('exports', { create: true })
    const names: string[] = []
    for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
      names.push(name)
    }
    return names
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/export.html')
  await page.waitForFunction(() => 'runExport' in window)
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry('exports', { recursive: true }).catch(() => {})
  })
})

for (const worker of [false, true]) {
  test(`streams a playable MP4 into OPFS (${worker ? 'worker' : 'main thread'})`, async ({
    page,
  }) => {
    const result = await page.evaluate((p) => (window as unknown as Win).runExport(p), {
      ...base,
      worker,
    })
    expect(result.save).toBe('opfs')
    const names = await opfsExports(page)
    expect(names).toHaveLength(1)

    // The file written by the stream target (no fast start: moov after mdat) must still play.
    const media = await page.evaluate(async (url) => {
      const v = document.createElement('video')
      v.muted = true
      v.src = url
      await new Promise((ok, fail) => {
        v.onloadedmetadata = ok
        v.onerror = () => fail(new Error(String(v.error?.message)))
      })
      return { duration: v.duration, width: v.videoWidth, height: v.videoHeight }
    }, result.url as string)
    expect(media.width).toBe(720)
    expect(media.height).toBe(1280)
    expect(media.duration).toBeGreaterThan(4.9)
    expect(media.duration).toBeLessThan(5.1)
  })

  test(`cancel discards the OPFS file (${worker ? 'worker' : 'main thread'})`, async ({ page }) => {
    const outcome = await page.evaluate(
      async (p) => {
        const run = (window as unknown as Win).runExport(p)
        setTimeout(() => document.getElementById('cancel')!.click(), 700)
        try {
          await run
          return 'finished'
        } catch (error) {
          return (error as Error).name
        }
      },
      { ...base, durationSec: 60, worker },
    )
    expect(outcome).toBe('AbortError')
    // The entry may exist, but nothing must have been committed into it.
    const sizes = await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory()
      const dir = await root.getDirectoryHandle('exports', { create: true })
      const out: number[] = []
      for await (const handle of (
        dir as unknown as { values(): AsyncIterable<FileSystemFileHandle> }
      ).values()) {
        out.push((await handle.getFile()).size)
      }
      return out
    })
    expect(sizes.every((s) => s === 0)).toBe(true)
  })
}
