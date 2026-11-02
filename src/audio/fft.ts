/** In-place iterative radix-2 complex FFT with precomputed twiddles. */
export class FFT {
  readonly size: number
  private readonly cos: Float64Array
  private readonly sin: Float64Array
  private readonly reversed: Uint32Array

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`FFT size must be a power of two, got ${size}`)
    }
    this.size = size
    this.cos = new Float64Array(size / 2)
    this.sin = new Float64Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      const angle = (2 * Math.PI * i) / size
      this.cos[i] = Math.cos(angle)
      this.sin[i] = -Math.sin(angle)
    }
    const bits = Math.log2(size)
    this.reversed = new Uint32Array(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.reversed[i] = r
    }
  }

  /** Forward transform of (re, im) in place. Both arrays must have length `size`. */
  transform(re: Float64Array, im: Float64Array): void {
    const n = this.size
    const rev = this.reversed
    for (let i = 0; i < n; i++) {
      const j = rev[i]!
      if (j > i) {
        const tr = re[i]!
        re[i] = re[j]!
        re[j] = tr
        const ti = im[i]!
        im[i] = im[j]!
        im[j] = ti
      }
    }
    const cos = this.cos
    const sin = this.sin
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1
      const step = n / len
      for (let i = 0; i < n; i += len) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const wr = cos[t]!
          const wi = sin[t]!
          const a = i + k
          const b = a + half
          const br = re[b]!
          const bi = im[b]!
          const xr = br * wr - bi * wi
          const xi = br * wi + bi * wr
          const ar = re[a]!
          const ai = im[a]!
          re[b] = ar - xr
          im[b] = ai - xi
          re[a] = ar + xr
          im[a] = ai + xi
        }
      }
    }
  }
}

/** Periodic Hann window. */
export function hannWindow(size: number): Float64Array {
  const w = new Float64Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  return w
}
