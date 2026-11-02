/**
 * STUB for the export module: walks every output frame through a FrameRenderer on an
 * OffscreenCanvas and reports progress, but does not encode anything yet.
 * The real exporter comes from `@/export`; the main session swaps it in.
 */
import { frameCountFor, type FrameRenderer, type OutputSettings, type Timeline } from '@/shared'

export interface ExportJob {
  timeline: Timeline
  output: OutputSettings
  createRenderer: () => FrameRenderer
  /** 0..1 */
  onProgress: (progress: number) => void
  signal: AbortSignal
}

/** Resolves with the encoded file, or null while encoding is stubbed. Rejects with AbortError. */
export async function exportVideoStub(job: ExportJob): Promise<Blob | null> {
  const { timeline, output, signal } = job
  const total = frameCountFor(timeline.audio.durationSec, output.fps)
  const canvas = new OffscreenCanvas(output.width, output.height)
  const renderer = job.createRenderer()
  await renderer.init({
    canvas,
    width: output.width,
    height: output.height,
    fps: output.fps,
    timeline,
    scene: null,
  })
  try {
    let lastYield = performance.now()
    for (let frame = 0; frame < total; frame++) {
      signal.throwIfAborted()
      await renderer.renderFrame(frame)
      // Yield to the UI ~30 times a second so progress paints and Cancel stays responsive.
      if (performance.now() - lastYield > 32) {
        job.onProgress(frame / total)
        await new Promise((resolve) => setTimeout(resolve, 0))
        lastYield = performance.now()
      }
    }
    job.onProgress(1)
    return null
  } finally {
    renderer.dispose()
  }
}
