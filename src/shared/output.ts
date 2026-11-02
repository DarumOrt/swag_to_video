/**
 * Output (video format) settings — shared by ui, render and export.
 * Owned by the main session.
 */

export type AspectPreset = '9:16' | '16:9' | '1:1' | '4:5' | 'custom'

export type FrameRate = 24 | 30 | 60

export type VideoContainer = 'mp4' | 'webm'

export interface OutputSettings {
  aspect: AspectPreset
  width: number
  height: number
  fps: FrameRate
  container: VideoContainer
  /** Bits per second; null = let the exporter pick from resolution and fps. */
  videoBitrate: number | null
  /** Transparent background (WebM VP9 with alpha) — only when the browser supports it. */
  transparent: boolean
}

export const DEFAULT_OUTPUT: OutputSettings = {
  aspect: '9:16',
  width: 1080,
  height: 1920,
  fps: 30,
  container: 'mp4',
  videoBitrate: null,
  transparent: false,
}

/** Total output frames for a track of `durationSec`. */
export function frameCountFor(durationSec: number, fps: FrameRate): number {
  return Math.ceil(durationSec * fps)
}
