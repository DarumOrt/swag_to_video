import type { BandReaction, Ctx2D, FrameContext, Layer, LayerSpecBase } from '../types'

export interface ColorStop {
  /** 0..1 */
  offset: number
  color: string
}

export type BackgroundFill =
  | { kind: 'solid'; color: string }
  /** CSS-like angle: 180 = top → bottom, 90 = left → right. */
  | { kind: 'linear'; angleDeg: number; stops: ColorStop[] }
  /** Center in fractions of the frame, radius as a fraction of the longer side. */
  | { kind: 'radial'; cx: number; cy: number; radius: number; stops: ColorStop[] }

export interface BackgroundSpec extends LayerSpecBase {
  type: 'background'
  fill: BackgroundFill
  /** Flash: overlays `pulseColor` with alpha = amount * band. */
  pulse: BandReaction | null
  pulseColor: string
  /** Edge darkening 0..1; 0 = off. */
  vignette: number
}

export const BACKGROUND_DEFAULTS: Omit<BackgroundSpec, 'id' | 'type'> = {
  fill: {
    kind: 'linear',
    angleDeg: 180,
    stops: [
      { offset: 0, color: '#0b0820' },
      { offset: 1, color: '#1a0b2e' },
    ],
  },
  pulse: { band: 'low', amount: 0.08 },
  pulseColor: '#7c3aed',
  vignette: 0.45,
}

/** Gradient line endpoints for a CSS-style angle covering the whole w×h box. */
export function linearGradientPoints(
  w: number,
  h: number,
  angleDeg: number,
): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = Math.abs((w / 2) * dx) + Math.abs((h / 2) * dy)
  const cx = w / 2
  const cy = h / 2
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half]
}

export class BackgroundLayer implements Layer {
  readonly id: string
  private readonly spec: BackgroundSpec

  constructor(spec: BackgroundSpec) {
    this.id = spec.id
    this.spec = spec
  }

  draw(g: Ctx2D, f: FrameContext): void {
    const { width: w, height: h } = f.layout
    const s = this.spec

    g.fillStyle = fillStyle(g, s.fill, w, h)
    g.fillRect(0, 0, w, h)

    if (s.pulse && s.pulse.amount > 0) {
      const a = Math.min(s.pulse.amount * f.band(s.pulse.band), 1)
      if (a > 0) {
        const prev = g.globalAlpha
        g.globalAlpha = prev * a
        g.fillStyle = s.pulseColor
        g.fillRect(0, 0, w, h)
        g.globalAlpha = prev
      }
    }

    if (s.vignette > 0) {
      const r = Math.hypot(w, h) / 2
      const v = g.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r)
      v.addColorStop(0, 'rgba(0,0,0,0)')
      v.addColorStop(1, `rgba(0,0,0,${Math.min(s.vignette, 1)})`)
      g.fillStyle = v
      g.fillRect(0, 0, w, h)
    }
  }
}

function fillStyle(g: Ctx2D, fill: BackgroundFill, w: number, h: number): string | CanvasGradient {
  switch (fill.kind) {
    case 'solid':
      return fill.color
    case 'linear': {
      const [x0, y0, x1, y1] = linearGradientPoints(w, h, fill.angleDeg)
      return withStops(g.createLinearGradient(x0, y0, x1, y1), fill.stops)
    }
    case 'radial': {
      const cx = fill.cx * w
      const cy = fill.cy * h
      const r = Math.max(fill.radius * Math.max(w, h), 1)
      return withStops(g.createRadialGradient(cx, cy, 0, cx, cy, r), fill.stops)
    }
  }
}

function withStops(grad: CanvasGradient, stops: ColorStop[]): CanvasGradient {
  for (const s of stops) grad.addColorStop(Math.min(Math.max(s.offset, 0), 1), s.color)
  return grad
}
