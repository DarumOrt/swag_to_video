/**
 * Scene format — what `RendererInit.scene` contains. A scene is a seed, a safe-area mode and a
 * stack of layers drawn bottom to top. Layer specs may omit any field that has a default.
 */

import { SPECTRUM_BARS_DEFAULTS, type SpectrumBarsSpec } from '@/visualizers'
import type { SafeAreaMode } from './layout'
import { BACKGROUND_DEFAULTS, type BackgroundSpec } from './layers/background'
import { TEXT_DEFAULTS, type TextSpec } from './layers/text'

export const SCENE_VERSION = 1

export type LayerSpec = BackgroundSpec | SpectrumBarsSpec | TextSpec
export type LayerType = LayerSpec['type']

export interface Scene {
  version: typeof SCENE_VERSION
  /** Base seed for all seeded randomness in the scene. */
  seed: number
  safeArea: SafeAreaMode
  /** Bottom to top. */
  layers: LayerSpec[]
}

/** Scene as authored: layer fields with defaults are optional. */
export interface SceneInput {
  version?: typeof SCENE_VERSION
  seed?: number
  safeArea?: SafeAreaMode
  layers: LayerSpecInput[]
}

type Partialize<T extends LayerSpec> = T extends LayerSpec
  ? Partial<Omit<T, 'id' | 'type'>> & Pick<T, 'id' | 'type'>
  : never
export type LayerSpecInput = Partialize<LayerSpec> | (Partialize<TextSpec> & { text: string })

const LAYER_DEFAULTS: { [K in LayerType]: object } = {
  background: BACKGROUND_DEFAULTS,
  'spectrum-bars': SPECTRUM_BARS_DEFAULTS,
  text: { ...TEXT_DEFAULTS, text: '' },
}

/**
 * Validate and fill defaults. `null`/`undefined` → `createDefaultScene()`.
 * Throws on unknown layer types and duplicate ids.
 */
export function normalizeScene(input: unknown): Scene {
  if (input === null || input === undefined) return createDefaultScene()
  if (typeof input !== 'object' || !Array.isArray((input as SceneInput).layers)) {
    throw new Error('Scene must be an object with a `layers` array')
  }
  const src = input as SceneInput
  const ids = new Set<string>()
  const layers = src.layers.map((layer, i) => {
    const defaults = LAYER_DEFAULTS[layer.type as LayerType] as object | undefined
    if (!defaults) throw new Error(`Unknown layer type "${String(layer.type)}" at index ${i}`)
    if (!layer.id) throw new Error(`Layer at index ${i} has no id`)
    if (ids.has(layer.id)) throw new Error(`Duplicate layer id "${layer.id}"`)
    ids.add(layer.id)
    return { ...structuredClone(defaults), ...layer } as LayerSpec
  })
  return {
    version: SCENE_VERSION,
    seed: src.seed ?? 1,
    safeArea: src.safeArea ?? 'social',
    layers,
  }
}

/** Milestone-1 default scene: gradient background, spectrum bars, title. */
export function createDefaultScene(title = 'SwagToVideo'): Scene {
  return normalizeScene({
    layers: [
      { id: 'bg', type: 'background' },
      { id: 'spectrum', type: 'spectrum-bars' },
      { id: 'title', type: 'text', text: title },
    ],
  })
}
