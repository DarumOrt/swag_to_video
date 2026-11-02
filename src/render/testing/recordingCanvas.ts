/**
 * Test double for a 2D canvas: records every context call and property write as a flat log, so
 * tests can assert that two renders of the same frame issue identical drawing commands.
 * Node has no canvas; this is the cheapest way to test the engine end to end.
 */

export type DrawLog = unknown[][]

export function createRecordingCanvas(): {
  canvas: { width: number; height: number; getContext: () => unknown }
  log: DrawLog
} {
  const log: DrawLog = []
  const state: Record<string | symbol, unknown> = { font: '10px sans-serif' }

  const gradient = (kind: string, args: unknown[]) => {
    log.push([kind, ...args])
    return { addColorStop: (o: number, c: string) => log.push(['addColorStop', o, c]) }
  }

  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (...args: unknown[]) => gradient(String(prop), args)
      }
      if (prop === 'measureText') {
        return (s: string) => {
          const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(target.font))?.[1] ?? 10)
          return { width: s.length * px * 0.55 }
        }
      }
      if (prop in target) return target[prop]
      return (...args: unknown[]) => {
        log.push([String(prop), ...args])
      }
    },
    set(target, prop, value) {
      target[prop] = value
      log.push(['set', String(prop), value && typeof value === 'object' ? 'gradient' : value])
      return true
    },
  })

  return { canvas: { width: 0, height: 0, getContext: () => ctx }, log }
}
