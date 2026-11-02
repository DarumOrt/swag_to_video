/**
 * The render engine: draws frame N of a scene into a canvas (HTMLCanvasElement or OffscreenCanvas).
 * Canvas 2D compositing; each layer draws inside save()/restore() with its opacity and blend mode.
 */

import type { FrameRate, FrameRenderer, RenderCanvas, RendererInit, Timeline } from '@/shared'
import { computeLayout, resolveRect, type Layout } from './layout'
import { hash32 } from './random'
import { createLayer } from './registry'
import { featurePosition, frameTime, sampleSeries, sampleSpectrum } from './sampling'
import { normalizeScene, type Scene } from './scene'
import type { Ctx2D, FrameContext, Layer } from './types'

interface LayerEntry {
  layer: Layer
  opacity: number
  blend: GlobalCompositeOperation
  seed: number
}

export interface SceneRendererOptions {
  /**
   * Keep the canvas on the CPU rasterizer. Use when pixels are read back with getImageData
   * (pixel tests, hashing). Chrome moves a GPU canvas to the CPU after the first readback, and the
   * two rasterizers anti-alias slightly differently, so mixing them breaks pixel equality.
   */
  willReadFrequently?: boolean
}

export class SceneRenderer implements FrameRenderer {
  private readonly options: SceneRendererOptions
  private canvas: RenderCanvas | null = null
  private g: Ctx2D | null = null
  private fps: FrameRate = 30
  private timeline: Timeline | null = null
  private scene: Scene | null = null
  private layout: Layout | null = null
  private layers: LayerEntry[] = []

  constructor(options: SceneRendererOptions = {}) {
    this.options = options
  }

  async init(options: RendererInit): Promise<void> {
    this.dispose()
    const g = options.canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: this.options.willReadFrequently ?? false,
    }) as Ctx2D | null
    if (!g) throw new Error('Canvas 2D context is not available')
    this.canvas = options.canvas
    this.g = g
    this.fps = options.fps
    this.timeline = options.timeline
    this.scene = normalizeScene(options.scene)
    this.layers = this.scene.layers
      .filter((spec) => spec.enabled !== false)
      .map((spec) => ({
        layer: createLayer(spec),
        opacity: spec.opacity ?? 1,
        blend: spec.blend ?? 'source-over',
        seed: hash32(this.scene?.seed ?? 1, spec.id),
      }))
    this.resize(options.width, options.height)
  }

  resize(width: number, height: number): void {
    if (!this.canvas || !this.scene) throw new Error('SceneRenderer.resize() before init()')
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (this.canvas.width !== w) this.canvas.width = w
    if (this.canvas.height !== h) this.canvas.height = h
    this.layout = computeLayout(w, h, this.scene.safeArea)
  }

  renderFrame(frameIndex: number): void {
    const { g, timeline, layout } = this
    if (!g || !timeline || !layout) throw new Error('SceneRenderer.renderFrame() before init()')

    const base = createFrameContext(timeline, layout, frameIndex, this.fps)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, layout.width, layout.height)

    for (const entry of this.layers) {
      if (entry.opacity <= 0) continue
      g.save()
      g.globalAlpha = entry.opacity
      g.globalCompositeOperation = entry.blend
      entry.layer.draw(g, { ...base, seed: entry.seed })
      g.restore()
    }
  }

  dispose(): void {
    for (const entry of this.layers) entry.layer.dispose?.()
    this.layers = []
    this.canvas = null
    this.g = null
    this.timeline = null
    this.scene = null
    this.layout = null
  }
}

/** Per-frame context: the only inputs layers may use. */
export function createFrameContext(
  timeline: Timeline,
  layout: Layout,
  frameIndex: number,
  fps: number,
): FrameContext {
  const features = timeline.audio.features
  const pos = featurePosition(features, frameIndex, fps)
  return {
    frameIndex,
    fps,
    time: frameTime(frameIndex, fps),
    featurePos: pos,
    timeline,
    layout,
    seed: 0,
    sample: (series) => sampleSeries(series, pos),
    band: (band) => sampleSeries(features.bands[band], pos),
    spectrumAt: (p, out) => sampleSpectrum(features, p, out),
    rect: (spec) => resolveRect(spec, layout),
  }
}
