/** q-th quantile (0..1) of the finite values, or NaN if there are none. */
export function percentile(values: ArrayLike<number>, q: number): number {
  const finite: number[] = []
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (Number.isFinite(v)) finite.push(v)
  }
  if (finite.length === 0) return Number.NaN
  finite.sort((a, b) => a - b)
  const index = Math.min(finite.length - 1, Math.max(0, Math.round(q * (finite.length - 1))))
  return finite[index]!
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Attack/release smoothing in place: moves toward each new value by `attack` when rising and by
 * `release` when falling (coefficients 0..1 per step, 1 = no smoothing).
 */
export function smoothAttackRelease(
  data: Float32Array,
  attack: number,
  release: number,
  stride = 1,
): void {
  for (let lane = 0; lane < stride; lane++) {
    let prev = 0
    for (let i = lane; i < data.length; i += stride) {
      const v = data[i]!
      prev += (v - prev) * (v > prev ? attack : release)
      data[i] = prev
    }
  }
}

/** Sub-sample offset (-0.5..0.5) of a peak at i from a parabola through i-1, i, i+1. */
export function parabolicOffset(values: ArrayLike<number>, i: number): number {
  if (i <= 0 || i >= values.length - 1) return 0
  const a = values[i - 1]!
  const b = values[i]!
  const c = values[i + 1]!
  const denom = a - 2 * b + c
  if (denom >= 0) return 0
  const offset = (0.5 * (a - c)) / denom
  return Math.max(-0.5, Math.min(0.5, offset))
}
