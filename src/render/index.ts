/**
 * Public API of the render module.
 * Owned by the "Рендер-движок и визуализация" session — see docs/sessions/render-engine.md.
 */

export { SceneRenderer, type SceneRendererOptions } from './SceneRenderer'
export {
  createDefaultScene,
  normalizeScene,
  SCENE_VERSION,
  type LayerSpec,
  type LayerSpecInput,
  type LayerType,
  type Scene,
  type SceneInput,
} from './scene'
export type { BackgroundFill, BackgroundSpec, ColorStop } from './layers/background'
export { DEFAULT_FONT_FAMILY, type TextSpec } from './layers/text'
export { LYRICS_DEFAULTS, type LyricsSpec } from './layers/lyrics'
export { EMBEDDED_FONTS, FONT_FAMILY, fontStack, loadEmbeddedFonts } from './fonts'
export {
  computeLayout,
  resolveRect,
  safeAreaInsets,
  type Layout,
  type PixelRect,
  type RectSpec,
  type SafeAreaMode,
} from './layout'
export type { BandReaction, Ctx2D, FrameContext, Layer, LayerSpecBase } from './types'

/** Synthetic timeline for dev pages and tests (also used by export). */
export { createFakeTimeline, type FakeTimelineOptions } from './dev/fakeTimeline'
