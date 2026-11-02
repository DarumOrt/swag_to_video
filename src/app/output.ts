import type { AspectPreset, OutputSettings } from '@/shared'

/** Aspect presets offered in the UI (`custom` comes later). */
export type UiAspect = Exclude<AspectPreset, 'custom'>

export const UI_ASPECTS: readonly UiAspect[] = ['9:16', '16:9', '1:1', '4:5']

const RATIOS: Record<UiAspect, [number, number]> = {
  '9:16': [9, 16],
  '16:9': [16, 9],
  '1:1': [1, 1],
  '4:5': [4, 5],
}

/** Resolution presets by the short side of the frame. */
export const SHORT_SIDES = [720, 1080, 1440, 2160] as const
export type ShortSide = (typeof SHORT_SIDES)[number]

export const SHORT_SIDE_LABELS: Record<ShortSide, string> = {
  720: '720p',
  1080: '1080p',
  1440: '1440p',
  2160: '4K',
}

function even(value: number): number {
  return Math.round(value / 2) * 2
}

/** Frame size for an aspect preset at a given short side. Encoders need even dimensions. */
export function sizeFor(aspect: UiAspect, shortSide: number): { width: number; height: number } {
  const [w, h] = RATIOS[aspect]
  return w <= h
    ? { width: even(shortSide), height: even((shortSide * h) / w) }
    : { width: even((shortSide * w) / h), height: even(shortSide) }
}

export function shortSideOf(output: Pick<OutputSettings, 'width' | 'height'>): number {
  return Math.min(output.width, output.height)
}

/** Closest preset to the current size, so the select always shows something sensible. */
export function nearestShortSide(output: Pick<OutputSettings, 'width' | 'height'>): ShortSide {
  const current = shortSideOf(output)
  return SHORT_SIDES.reduce((best, side) =>
    Math.abs(side - current) < Math.abs(best - current) ? side : best,
  )
}

/** Applies a new aspect while keeping the chosen resolution class. */
export function withAspect(output: OutputSettings, aspect: UiAspect): OutputSettings {
  return { ...output, aspect, ...sizeFor(aspect, shortSideOf(output)) }
}

export function withShortSide(output: OutputSettings, shortSide: number): OutputSettings {
  const aspect = output.aspect === 'custom' ? '9:16' : output.aspect
  return { ...output, aspect, ...sizeFor(aspect, shortSide) }
}
