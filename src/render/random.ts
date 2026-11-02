/**
 * Seeded randomness. The renderer must never call Math.random(): every random value is derived
 * from (scene seed, salt, frame), so frame N always looks the same.
 */

/** 32-bit string/number hash (FNV-1a). */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const part of parts) {
    const s = typeof part === 'number' ? String(part) : part
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    // Separator so ('ab', 'c') !== ('a', 'bc').
    h ^= 0xff
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 PRNG: returns a function yielding floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
