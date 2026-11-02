/**
 * Renderer contract between render (implements), export and ui (call it).
 * Owned by the main session.
 *
 * Determinism rule: output depends only on (timeline, scene, size, frameIndex, fps).
 * No wall-clock time, no unseeded randomness. Preview frame N === exported frame N.
 */

import type { FrameRate } from './output'
import type { Timeline } from './timeline'

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas

export interface RendererInit {
  canvas: RenderCanvas
  width: number
  height: number
  fps: FrameRate
  timeline: Timeline
  /** Scene description (layers, preset params). Shape is defined by the render session. */
  scene: unknown
}

export interface FrameRenderer {
  init(options: RendererInit): Promise<void>
  /** Draw frame `frameIndex` (time = frameIndex / fps) into the canvas. */
  renderFrame(frameIndex: number): void | Promise<void>
  resize(width: number, height: number): void
  dispose(): void
}
