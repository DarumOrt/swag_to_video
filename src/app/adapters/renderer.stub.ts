/**
 * STUB FrameRenderer (Canvas 2D) with the same shape as the real one from `@/render`.
 * Deterministic: draws only from (timeline, size, frameIndex, fps).
 */
import {
  featureIndexAt,
  type FrameRate,
  type FrameRenderer,
  type RenderCanvas,
  type RendererInit,
  type Timeline,
} from '@/shared'

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export class StubRenderer implements FrameRenderer {
  private canvas: RenderCanvas | null = null
  private ctx: Context2D | null = null
  private timeline: Timeline | null = null
  private fps: FrameRate = 30
  private width = 0
  private height = 0

  private readonly label: string

  constructor(label: string) {
    this.label = label
  }

  async init(options: RendererInit): Promise<void> {
    this.canvas = options.canvas
    this.ctx = options.canvas.getContext('2d') as Context2D | null
    if (!this.ctx) throw new Error('2D context unavailable')
    this.timeline = options.timeline
    this.fps = options.fps
    this.resize(options.width, options.height)
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return
    this.width = this.canvas.width = Math.max(1, Math.round(width))
    this.height = this.canvas.height = Math.max(1, Math.round(height))
  }

  renderFrame(frameIndex: number): void {
    const { ctx, timeline, width: w, height: h } = this
    if (!ctx || !timeline) return
    const time = frameIndex / this.fps
    const features = timeline.audio.features
    const index = featureIndexAt(features, time)
    const level = features.rms[index] ?? 0
    const low = features.bands.low[index] ?? 0
    const unit = Math.min(w, h) / 1080

    // Background breathes with the low band.
    const glow = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.7)
    glow.addColorStop(0, `oklch(${0.24 + low * 0.08} 0.04 168)`)
    glow.addColorStop(1, 'oklch(0.12 0.004 270)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    // Spectrum bars, mirrored around the centre line.
    const { binCount, data } = features.spectrum
    const areaW = w * 0.84
    const gap = Math.max(1, 4 * unit)
    const barW = (areaW - gap * (binCount - 1)) / binCount
    const baseY = h * 0.5
    const maxBar = Math.min(h * 0.22, w * 0.5)
    ctx.fillStyle = 'oklch(0.82 0.14 168)'
    for (let bin = 0; bin < binCount; bin++) {
      const value = data[index * binCount + bin] ?? 0
      const barH = Math.max(2 * unit, value * maxBar)
      const x = (w - areaW) / 2 + bin * (barW + gap)
      ctx.globalAlpha = 0.35 + value * 0.65
      ctx.fillRect(x, baseY - barH, barW, barH)
      ctx.globalAlpha = 0.12 + value * 0.2
      ctx.fillRect(x, baseY + 6 * unit, barW, barH * 0.6)
    }
    ctx.globalAlpha = 1

    // Level meter.
    const meterW = w * 0.84
    const meterY = h * 0.78
    ctx.fillStyle = 'oklch(0.27 0.006 270)'
    ctx.fillRect((w - meterW) / 2, meterY, meterW, 6 * unit)
    ctx.fillStyle = 'oklch(0.94 0.004 270)'
    ctx.fillRect((w - meterW) / 2, meterY, meterW * Math.min(1, level * 2.2), 6 * unit)

    // Timecode + stub label.
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'oklch(0.94 0.004 270)'
    ctx.font = `600 ${Math.round(56 * unit)}px ui-monospace, Consolas, monospace`
    ctx.fillText(timecode(time), w / 2, h * 0.86)
    ctx.fillStyle = 'oklch(0.52 0.01 270)'
    ctx.font = `500 ${Math.round(26 * unit)}px system-ui, sans-serif`
    ctx.fillText(`${this.label} · ${frameIndex}`, w / 2, h * 0.9)
  }

  dispose(): void {
    this.canvas = null
    this.ctx = null
    this.timeline = null
  }
}

function timecode(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const cs = Math.floor((seconds * 100) % 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}
