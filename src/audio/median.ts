/**
 * Sliding median over a strided 1D sequence: out[i] = median(src[i - radius .. i + radius]),
 * the window shrinking at the edges. Keeps the window sorted, so each step is O(radius).
 * Element i lives at src[offset + i * stride] (same layout in out).
 */
export function slidingMedian(
  src: Float32Array,
  out: Float32Array,
  count: number,
  offset: number,
  stride: number,
  radius: number,
): void {
  // One spare slot: each step inserts before it removes.
  const window = new Float64Array(2 * radius + 2)
  let size = 0

  const insert = (v: number) => {
    let lo = 0
    let hi = size
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (window[mid]! < v) lo = mid + 1
      else hi = mid
    }
    window.copyWithin(lo + 1, lo, size)
    window[lo] = v
    size++
  }
  const remove = (v: number) => {
    let lo = 0
    let hi = size
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (window[mid]! < v) lo = mid + 1
      else hi = mid
    }
    window.copyWithin(lo, lo + 1, size)
    size--
  }

  for (let i = 0; i < Math.min(radius, count); i++) insert(src[offset + i * stride]!)
  for (let i = 0; i < count; i++) {
    const add = i + radius
    if (add < count) insert(src[offset + add * stride]!)
    const drop = i - radius - 1
    if (drop >= 0) remove(src[offset + drop * stride]!)
    out[offset + i * stride] =
      size % 2 === 1 ? window[size >> 1]! : 0.5 * (window[(size >> 1) - 1]! + window[size >> 1]!)
  }
}
