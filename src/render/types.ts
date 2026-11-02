/**
 * Layer contract of the render engine. Visualizers and effects implement `Layer` and import these
 * types with `import type` only — runtime helpers reach them through `FrameContext`.
 */

import type { Timeline } from '@/shared'
import type { Layout, PixelRect, RectSpec } from './layout'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Fields shared by every layer spec in a scene. */
export interface LayerSpecBase {
  /** Unique within the scene; also salts the layer's random seed. */
  id: string
  type: string
  /** Default true. */
  enabled?: boolean
  /** 0..1, default 1. */
  opacity?: number
  /** Canvas composite operation, default 'source-over'. */
  blend?: GlobalCompositeOperation
}

/** Which audio band drives a reaction, and how strongly. */
export interface BandReaction {
  band: 'low' | 'mid' | 'high'
  /** 0 = no reaction. Meaning is layer-specific (scale, brightness...). */
  amount: number
}

/** Everything a layer may depend on when drawing a frame. Nothing else is allowed. */
export interface FrameContext {
  frameIndex: number
  fps: number
  /** frameIndex / fps, seconds. */
  time: number
  /** Fractional position on the feature grid (see `featurePosition`). */
  featurePos: number
  timeline: Timeline
  layout: Layout
  /** Scene seed mixed with the layer id. */
  seed: number
  /** Feature series value at the current frame (linear interpolation). */
  sample(series: ArrayLike<number>): number
  /** Band energy 0..1 at the current frame. */
  band(band: BandReaction['band']): number
  /** Spectrum row at a feature-grid position, written into `out` (length = spectrum.binCount). */
  spectrumAt(pos: number, out: Float32Array): void
  rect(spec: RectSpec): PixelRect
}

export interface Layer {
  readonly id: string
  /** Draw the frame. The engine wraps this in save()/restore() and sets opacity and blend. */
  draw(g: Ctx2D, frame: FrameContext): void
  dispose?(): void
}
