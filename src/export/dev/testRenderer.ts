/**
 * Test renderer for export checks (until the real render engine is ready).
 * Draws: background hue by time, frame counter + timecode, a bar sweeping once per second,
 * and a white flash on every whole second — synced with the clicks in `syntheticAudio`.
 */

import type { FrameRate, FrameRenderer, RendererInit } from '@/shared'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export class TestFrameRenderer implements FrameRenderer {
  private ctx: Ctx2D | null = null
  private width = 0
  private height = 0
  private fps: FrameRate = 30

  async init(options: RendererInit): Promise<void> {
    const ctx = options.canvas.getContext('2d', { alpha: false }) as Ctx2D | null
    if (!ctx) throw new Error('2D context unavailable')
    this.ctx = ctx
    this.width = options.width
    this.height = options.height
    this.fps = options.fps
  }

  renderFrame(frameIndex: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const { width: w, height: h, fps } = this
    const t = frameIndex / fps
    const second = Math.floor(t)
    const frameInSecond = frameIndex % fps

    ctx.fillStyle = `hsl(${(t * 36) % 360} 60% 25%)`
    ctx.fillRect(0, 0, w, h)

    // Flash on the first frame of each second (audio click starts at the same instant).
    if (frameInSecond === 0) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
    }

    // Bar sweeping left → right once per second.
    const barX = (frameInSecond / fps) * w
    ctx.fillStyle = '#ffd400'
    ctx.fillRect(barX, h * 0.7, Math.max(4, w / fps), h * 0.08)

    // Second ticks.
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let i = 0; i <= 10; i++) ctx.fillRect((i / 10) * w - 1, h * 0.8, 2, h * 0.02)

    const unit = Math.min(w, h) / 10
    ctx.fillStyle = frameInSecond === 0 ? '#000' : '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${unit * 1.6}px system-ui, sans-serif`
    ctx.fillText(String(frameIndex), w / 2, h * 0.35)
    ctx.font = `${unit * 0.6}px ui-monospace, monospace`
    const ms = Math.round((t - second) * 1000)
    ctx.fillText(`${second}s ${String(ms).padStart(3, '0')}ms · ${fps} fps`, w / 2, h * 0.5)
    ctx.fillText(`${w}×${h}`, w / 2, h * 0.58)
  }

  resize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  dispose(): void {
    this.ctx = null
  }
}
