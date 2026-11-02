/**
 * Frame-cost benchmark for the render engine, run from e2e/render/frame-cost.spec.ts (or the console:
 * `(await import('/src/render/dev/bench.ts')).runFrameCostBench()`). Dev-only.
 *
 * Each case renders frames into an OffscreenCanvas and pushes them through the same path as export:
 * VideoFrame → VideoEncoder (H.264, hardware preferred). `render` is the CPU time of renderFrame;
 * `total` is wall time per frame including GPU raster and encoding, after the encoder queue drains.
 */

import type { FrameRate } from '@/shared'
import { SceneRenderer } from '../SceneRenderer'
import type { SceneInput } from '../scene'
import { createFakeTimeline } from './fakeTimeline'

export interface BenchCase {
  label: string
  scene: SceneInput | null
  /** Canvas alpha (SceneRendererOptions.alpha), default true. */
  alpha?: boolean
}

export interface BenchResult {
  label: string
  renderMs: number
  totalMs: number
  fps: number
}

export const DEFAULT_BENCH_CASES: BenchCase[] = [
  { label: 'empty', scene: { layers: [] } },
  { label: 'background', scene: { layers: [{ id: 'bg', type: 'background' }] } },
  { label: 'spectrum-bars', scene: { layers: [{ id: 's', type: 'spectrum-bars' }] } },
  { label: 'title', scene: { layers: [{ id: 't', type: 'text', text: 'Ночной город' }] } },
  { label: 'lyrics', scene: { layers: [{ id: 'l', type: 'lyrics' }] } },
  { label: 'default scene', scene: null },
  { label: 'empty, opaque canvas', scene: { layers: [] }, alpha: false },
  { label: 'default scene, opaque canvas', scene: null, alpha: false },
]

export async function runFrameCostBench(
  options: {
    width?: number
    height?: number
    fps?: FrameRate
    frames?: number
    durationSec?: number
    cases?: BenchCase[]
  } = {},
): Promise<BenchResult[]> {
  const width = options.width ?? 1080
  const height = options.height ?? 1920
  const fps = options.fps ?? 30
  const frames = options.frames ?? 150
  const timeline = createFakeTimeline({ durationSec: options.durationSec ?? 180 })
  const results: BenchResult[] = []

  for (const c of options.cases ?? DEFAULT_BENCH_CASES) {
    const canvas = new OffscreenCanvas(width, height)
    const renderer = new SceneRenderer({ alpha: c.alpha ?? true })
    await renderer.init({ canvas, width, height, fps, timeline, scene: c.scene })

    const encoder = await createEncoder(width, height, fps)

    // Start mid-track, where lyrics and full energy are present.
    const first = Math.floor(timeline.audio.durationSec * 0.4 * fps)
    let renderMs = 0
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
      const a = performance.now()
      renderer.renderFrame(first + i)
      renderMs += performance.now() - a
      const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps) })
      encoder.encode(frame, { keyFrame: i % 60 === 0 })
      frame.close()
      // Back-pressure like a real exporter; give up if the encoder dies or stalls.
      const waitStart = performance.now()
      while (encoder.state === 'configured' && encoder.encodeQueueSize > 4) {
        if (performance.now() - waitStart > 10_000) throw new Error(`${c.label}: encoder stalled`)
        await new Promise((r) => setTimeout(r, 1))
      }
      if (encoder.state !== 'configured') throw new Error(`${c.label}: encoder ${encoder.state}`)
    }
    await encoder.flush()
    const totalMs = (performance.now() - t0) / frames
    encoder.close()
    renderer.dispose()
    results.push({ label: c.label, renderMs: renderMs / frames, totalMs, fps: 1000 / totalMs })
    console.log(`[render bench] ${c.label}: ${totalMs.toFixed(2)} ms/frame`)
  }
  return results
}

async function createEncoder(width: number, height: number, fps: number): Promise<VideoEncoder> {
  for (const codec of ['avc1.640034', 'avc1.4d0034', 'avc1.420034', 'vp09.00.41.08']) {
    for (const hardwareAcceleration of ['prefer-hardware', 'no-preference'] as const) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate: 12_000_000,
        framerate: fps,
        hardwareAcceleration,
      }
      if (!(await VideoEncoder.isConfigSupported(config)).supported) continue
      const encoder = new VideoEncoder({
        output: () => {},
        error: (e) => console.error('bench encoder', e),
      })
      encoder.configure(config)
      return encoder
    }
  }
  throw new Error('No supported video encoder config')
}
