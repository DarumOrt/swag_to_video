import { expect, test } from '@playwright/test'

test('app loads with cross-origin isolation, WebCodecs and WebGPU', async ({ page }) => {
  await page.goto('/')
  const caps = await page.evaluate(async () => ({
    isolated: crossOriginIsolated,
    webCodecs: typeof VideoEncoder !== 'undefined',
    webGpuAdapter: 'gpu' in navigator && (await navigator.gpu.requestAdapter()) !== null,
  }))
  expect(caps).toEqual({ isolated: true, webCodecs: true, webGpuAdapter: true })
})
