import { defineConfig } from '@playwright/test'

// Uses the locally installed Chrome (no bundled browser download) in a visible window:
// headless Chrome often falls back to software WebGPU, which makes ML/render benchmarks meaningless.
// Each topic session keeps its e2e specs in e2e/<module>/ and may point baseURL at its own dev port.
export default defineConfig({
  testDir: './e2e',
  timeout: 10 * 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    headless: false,
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
      },
})
