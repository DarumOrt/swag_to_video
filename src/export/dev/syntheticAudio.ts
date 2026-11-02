/**
 * Synthetic test audio: quiet 220 Hz tone + a 1 kHz click at the start of every whole second
 * (matching the white flash of TestFrameRenderer), stereo with the click panned left on even
 * seconds and right on odd ones — so channel order is checkable too.
 */

import type { PcmAudio } from '../audio'

export function syntheticAudio(durationSec: number, sampleRate = 48_000): PcmAudio {
  const length = Math.round(durationSec * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const clickLength = Math.round(0.03 * sampleRate)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    const tone = 0.08 * Math.sin(2 * Math.PI * 220 * t)
    left[i] = tone
    right[i] = tone
  }
  for (let s = 0; s * sampleRate < length; s++) {
    const start = s * sampleRate
    const target = s % 2 === 0 ? left : right
    for (let j = 0; j < clickLength && start + j < length; j++) {
      const env = 1 - j / clickLength
      target[start + j] =
        target[start + j]! + 0.7 * env * Math.sin((2 * Math.PI * 1000 * j) / sampleRate)
    }
  }
  return { sampleRate, channels: [left, right] }
}
