/** Shared helpers for the render dev page and its worker. Dev-only. */

import type { SceneInput } from '../scene'

export const DEV_DURATION_SEC = 32

export function devScene(title: string): SceneInput {
  return {
    seed: 7,
    layers: [
      { id: 'bg', type: 'background' },
      { id: 'spectrum', type: 'spectrum-bars' },
      { id: 'title', type: 'text', text: title },
    ],
  }
}

/** FNV-1a over RGBA bytes — enough to compare two renders of the same frame. */
export function hashPixels(data: Uint8ClampedArray): string {
  let h = 0x811c9dc5
  for (let i = 0; i < data.length; i++) {
    h ^= data[i] ?? 0
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
