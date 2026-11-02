/**
 * Pure math for spectrum visualizers: mapping the log-frequency spectrum to bars and
 * deterministic meter-style release (decay) computed from past feature frames only.
 */

export interface SpectrumGrid {
  binCount: number
  minHz: number
  maxHz: number
}

/** Fractional bin position of frequency `hz` on a log-spaced grid. */
export function binPosition(grid: SpectrumGrid, hz: number): number {
  const span = Math.log(grid.maxHz / grid.minHz)
  if (!(span > 0)) return 0
  return ((grid.binCount - 1) * Math.log(hz / grid.minHz)) / span
}

/**
 * Bar edges as fractional bin positions: `barCount + 1` values, log-spaced between minHz and maxHz.
 */
export function barEdges(
  grid: SpectrumGrid,
  barCount: number,
  minHz: number,
  maxHz: number,
): Float32Array {
  const edges = new Float32Array(barCount + 1)
  const lo = Math.max(minHz, 1)
  const ratio = Math.max(maxHz, lo * 1.0001) / lo
  for (let k = 0; k <= barCount; k++) {
    edges[k] = binPosition(grid, lo * Math.pow(ratio, k / barCount))
  }
  return edges
}

/**
 * One spectrum row → bar values. A bar wider than a bin takes the max of the bins it covers;
 * a narrower bar takes the interpolated value at its center (keeps low bars from looking stepped).
 */
export function rowToBars(row: ArrayLike<number>, edges: Float32Array, out: Float32Array): void {
  const n = row.length
  const barCount = edges.length - 1
  for (let k = 0; k < barCount; k++) {
    const p0 = Math.max(edges[k] ?? 0, 0)
    const p1 = Math.min(edges[k + 1] ?? 0, n - 1)
    let v = 0
    if (p1 - p0 < 1) {
      const c = Math.min(Math.max((p0 + p1) / 2, 0), n - 1)
      const i0 = Math.floor(c)
      const i1 = Math.min(i0 + 1, n - 1)
      const a = row[i0] ?? 0
      v = a + ((row[i1] ?? 0) - a) * (c - i0)
    } else {
      for (let i = Math.floor(p0); i <= Math.ceil(p1) && i < n; i++) {
        const x = row[i] ?? 0
        if (x > v) v = x
      }
    }
    out[k] = v
  }
}

export interface ReleaseOptions {
  /** Feature grid rate, frames per second. */
  rate: number
  /** Time for a value to fall to 1/e. 0 = no smoothing. */
  releaseSec: number
}

/** Number of past feature frames that can still affect the current value. */
export function releaseWindow({ rate, releaseSec }: ReleaseOptions): number {
  if (releaseSec <= 0) return 0
  return Math.min(Math.ceil(rate * releaseSec * 4), 240)
}

/**
 * Meter-style bars with instant attack and exponential release:
 * value(pos) = max over k of bars(pos - k) * exp(-k / (rate * releaseSec)).
 * Uses only past frames of the timeline, so it is a pure function of `pos` (no renderer state):
 * scrubbing to any frame gives the same result as playing up to it.
 */
export function smoothedBars(
  pos: number,
  edges: Float32Array,
  binCount: number,
  release: ReleaseOptions,
  spectrumAt: (pos: number, out: Float32Array) => void,
  out: Float32Array,
  scratch: { row: Float32Array; bars: Float32Array },
): void {
  const window = releaseWindow(release)
  const decay = window > 0 ? Math.exp(-1 / (release.rate * release.releaseSec)) : 0
  if (scratch.row.length !== binCount) scratch.row = new Float32Array(binCount)
  if (scratch.bars.length !== out.length) scratch.bars = new Float32Array(out.length)
  out.fill(0)
  let weight = 1
  for (let k = 0; k <= window; k++) {
    const p = pos - k
    if (p < 0) break
    spectrumAt(p, scratch.row)
    rowToBars(scratch.row, edges, scratch.bars)
    for (let b = 0; b < out.length; b++) {
      const v = (scratch.bars[b] ?? 0) * weight
      if (v > (out[b] ?? 0)) out[b] = v
    }
    weight *= decay
  }
}
