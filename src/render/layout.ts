/**
 * Resolution-independent layout. Scenes describe positions as fractions of the frame (or of the
 * social-media safe area) and sizes in "units" (fraction of the shorter frame side), so the same
 * scene works for 9:16, 16:9, 1:1 and any custom size.
 */

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Rect in fractions 0..1 of the chosen space. */
export interface RectSpec {
  x: number
  y: number
  w: number
  h: number
  /** 'safe' = relative to the safe area (default), 'frame' = relative to the whole frame. */
  space?: 'safe' | 'frame'
}

export type SafeAreaMode = 'social' | 'none'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Layout {
  width: number
  height: number
  /** Shorter side in pixels — base for sizes (font size 0.1 = 10% of the shorter side). */
  unit: number
  frame: PixelRect
  safe: PixelRect
}

/**
 * Safe-area insets as fractions of the frame.
 * Portrait (TikTok / Reels / Shorts): caption and buttons at the bottom, action column on the right.
 */
export function safeAreaInsets(width: number, height: number, mode: SafeAreaMode): Insets {
  if (mode === 'none') return { top: 0, right: 0, bottom: 0, left: 0 }
  const portrait = height / width > 1.3
  if (portrait) return { top: 0.1, right: 0.12, bottom: 0.2, left: 0.05 }
  return { top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 }
}

export function computeLayout(width: number, height: number, mode: SafeAreaMode): Layout {
  const i = safeAreaInsets(width, height, mode)
  return {
    width,
    height,
    unit: Math.min(width, height),
    frame: { x: 0, y: 0, w: width, h: height },
    safe: {
      x: i.left * width,
      y: i.top * height,
      w: (1 - i.left - i.right) * width,
      h: (1 - i.top - i.bottom) * height,
    },
  }
}

export function resolveRect(spec: RectSpec, layout: Layout): PixelRect {
  const base = spec.space === 'frame' ? layout.frame : layout.safe
  return {
    x: base.x + spec.x * base.w,
    y: base.y + spec.y * base.h,
    w: spec.w * base.w,
    h: spec.h * base.h,
  }
}
