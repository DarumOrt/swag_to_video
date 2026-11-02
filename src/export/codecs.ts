/**
 * Pure codec logic: codec strings, levels, default bitrates, frame timestamps.
 * No WebCodecs calls here, so everything is unit-testable in Node.
 */

import type { FrameRate, OutputSettings, VideoContainer } from '@/shared'

/** Video codec ids as mediabunny names them. */
export type VideoCodecId = 'avc' | 'vp9' | 'vp8'
/** Audio codec ids as mediabunny names them. */
export type AudioCodecId = 'aac' | 'opus'

export interface VideoCodecCandidate {
  codec: VideoCodecId
  /** WebCodecs codec string, e.g. `avc1.640028`. */
  codecString: string
  /** Human-readable label for the UI / report. */
  label: string
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** Presentation timestamp of frame N in microseconds (WebCodecs unit). */
export function frameTimestampUs(frameIndex: number, fps: FrameRate): number {
  return Math.round((frameIndex * 1_000_000) / fps)
}

/**
 * Duration of frame N in microseconds. Computed as the difference of rounded timestamps,
 * so consecutive frames tile exactly with no accumulated drift.
 */
export function frameDurationUs(frameIndex: number, fps: FrameRate): number {
  return frameTimestampUs(frameIndex + 1, fps) - frameTimestampUs(frameIndex, fps)
}

/** Key frame every `intervalSec` seconds (on frame 0 and every interval after). */
export function isKeyFrame(frameIndex: number, fps: FrameRate, intervalSec = 2): boolean {
  return frameIndex % Math.max(1, Math.round(fps * intervalSec)) === 0
}

/**
 * How many audio sample frames must be encoded so that audio covers video up to the end of frame N.
 * Used to interleave audio with video while encoding.
 */
export function audioSamplesUntilFrameEnd(
  frameIndex: number,
  fps: FrameRate,
  sampleRate: number,
): number {
  return Math.ceil(((frameIndex + 1) * sampleRate) / fps)
}

// ---------------------------------------------------------------------------
// Bitrate
// ---------------------------------------------------------------------------

const MIN_VIDEO_BITRATE = 1_000_000
const MAX_VIDEO_BITRATE = 100_000_000

/**
 * Default video bitrate when the user did not set one.
 * H.264 at ~0.13 bits/pixel at 30 fps (≈ YouTube's upload recommendations: 1080p30 ≈ 8 Mbps,
 * 1080p60 ≈ 12 Mbps, 4K30 ≈ 32 Mbps); fps scales sublinearly; VP9 needs ~30% less.
 * Visualizations are motion-heavy (particles, glitches), so we stay on the generous side.
 */
export function defaultVideoBitrate(
  width: number,
  height: number,
  fps: FrameRate,
  codec: VideoCodecId = 'avc',
): number {
  const bitsPerPixel = 0.13
  const base = width * height * 30 * bitsPerPixel
  const fpsFactor = Math.pow(fps / 30, 0.6)
  const codecFactor = codec === 'vp9' ? 0.7 : 1
  const raw = base * fpsFactor * codecFactor
  const clamped = Math.min(MAX_VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, raw))
  return Math.round(clamped / 100_000) * 100_000
}

export function videoBitrateFor(output: OutputSettings, codec: VideoCodecId): number {
  return output.videoBitrate ?? defaultVideoBitrate(output.width, output.height, output.fps, codec)
}

export function defaultAudioBitrate(codec: AudioCodecId): number {
  return codec === 'aac' ? 192_000 : 160_000
}

// ---------------------------------------------------------------------------
// H.264 levels
// ---------------------------------------------------------------------------

interface AvcLevel {
  /** level_idc, e.g. 40 for level 4.0. */
  idc: number
  maxMacroblocksPerSec: number
  maxFrameMacroblocks: number
}

// ITU-T H.264 Table A-1.
const AVC_LEVELS: AvcLevel[] = [
  { idc: 31, maxMacroblocksPerSec: 108_000, maxFrameMacroblocks: 3_600 },
  { idc: 32, maxMacroblocksPerSec: 216_000, maxFrameMacroblocks: 5_120 },
  { idc: 40, maxMacroblocksPerSec: 245_760, maxFrameMacroblocks: 8_192 },
  { idc: 42, maxMacroblocksPerSec: 522_240, maxFrameMacroblocks: 8_704 },
  { idc: 50, maxMacroblocksPerSec: 589_824, maxFrameMacroblocks: 22_080 },
  { idc: 51, maxMacroblocksPerSec: 983_040, maxFrameMacroblocks: 36_864 },
  { idc: 52, maxMacroblocksPerSec: 2_073_600, maxFrameMacroblocks: 36_864 },
  { idc: 60, maxMacroblocksPerSec: 4_177_920, maxFrameMacroblocks: 139_264 },
  { idc: 61, maxMacroblocksPerSec: 8_355_840, maxFrameMacroblocks: 139_264 },
  { idc: 62, maxMacroblocksPerSec: 16_711_680, maxFrameMacroblocks: 139_264 },
]

/** Lowest H.264 level_idc that fits the size and frame rate, or null if nothing does. */
export function avcLevelFor(width: number, height: number, fps: number): number | null {
  const mbW = Math.ceil(width / 16)
  const mbH = Math.ceil(height / 16)
  const frameMbs = mbW * mbH
  const mbps = frameMbs * fps
  for (const level of AVC_LEVELS) {
    // Each dimension is also limited to sqrt(8 * MaxFS) macroblocks.
    const maxDim = Math.sqrt(8 * level.maxFrameMacroblocks)
    if (
      frameMbs <= level.maxFrameMacroblocks &&
      mbps <= level.maxMacroblocksPerSec &&
      mbW <= maxDim &&
      mbH <= maxDim
    ) {
      return level.idc
    }
  }
  return null
}

const AVC_PROFILES = [
  { idc: 0x64, label: 'H.264 High' },
  { idc: 0x4d, label: 'H.264 Main' },
  { idc: 0x42, label: 'H.264 Baseline' },
] as const

export function avcCodecString(profileIdc: number, levelIdc: number): string {
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `avc1.${hex(profileIdc)}00${hex(levelIdc)}`
}

// ---------------------------------------------------------------------------
// VP9 levels
// ---------------------------------------------------------------------------

// VP9 bitstream spec, Annex A: max luma picture size and luma sample rate.
const VP9_LEVELS = [
  { code: '10', maxPictureSize: 36_864, maxSampleRate: 829_440 },
  { code: '11', maxPictureSize: 73_728, maxSampleRate: 2_764_800 },
  { code: '20', maxPictureSize: 122_880, maxSampleRate: 4_608_000 },
  { code: '21', maxPictureSize: 245_760, maxSampleRate: 9_216_000 },
  { code: '30', maxPictureSize: 552_960, maxSampleRate: 20_736_000 },
  { code: '31', maxPictureSize: 983_040, maxSampleRate: 36_864_000 },
  { code: '40', maxPictureSize: 2_228_224, maxSampleRate: 83_558_400 },
  { code: '41', maxPictureSize: 2_228_224, maxSampleRate: 160_432_128 },
  { code: '50', maxPictureSize: 8_912_896, maxSampleRate: 311_951_360 },
  { code: '51', maxPictureSize: 8_912_896, maxSampleRate: 588_251_136 },
  { code: '52', maxPictureSize: 8_912_896, maxSampleRate: 1_176_502_272 },
  { code: '60', maxPictureSize: 35_651_584, maxSampleRate: 1_176_502_272 },
  { code: '61', maxPictureSize: 35_651_584, maxSampleRate: 2_353_004_544 },
  { code: '62', maxPictureSize: 35_651_584, maxSampleRate: 4_706_009_088 },
] as const

/** VP9 level as the two-digit code used in `vp09.PP.LL.DD`, or null if nothing fits. */
export function vp9LevelFor(width: number, height: number, fps: number): string | null {
  const pictureSize = width * height
  const sampleRate = pictureSize * fps
  const level = VP9_LEVELS.find(
    (l) => pictureSize <= l.maxPictureSize && sampleRate <= l.maxSampleRate,
  )
  return level?.code ?? null
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

/**
 * Video codecs to try for the given output, best first.
 * MP4 → H.264 (High → Main → Baseline); WebM → VP9 → VP8 (VP8 has no alpha, so not for transparent).
 */
export function videoCodecCandidates(output: OutputSettings): VideoCodecCandidate[] {
  const { width, height, fps } = output
  if (output.container === 'mp4') {
    const level = avcLevelFor(width, height, fps)
    if (level === null) return []
    return AVC_PROFILES.map((p) => ({
      codec: 'avc' as const,
      codecString: avcCodecString(p.idc, level),
      label: p.label,
    }))
  }
  const candidates: VideoCodecCandidate[] = []
  const vp9Level = vp9LevelFor(width, height, fps)
  if (vp9Level !== null) {
    candidates.push({ codec: 'vp9', codecString: `vp09.00.${vp9Level}.08`, label: 'VP9' })
  }
  if (!output.transparent) {
    candidates.push({ codec: 'vp8', codecString: 'vp8', label: 'VP8' })
  }
  return candidates
}

export function audioCodecFor(container: VideoContainer): AudioCodecId {
  return container === 'mp4' ? 'aac' : 'opus'
}

export function audioCodecString(codec: AudioCodecId): string {
  return codec === 'aac' ? 'mp4a.40.2' : 'opus'
}

/**
 * Sample rates to try for the audio encoder: the source rate first (no resampling),
 * then the rates the codec is commonly supported at.
 */
export function audioSampleRateCandidates(codec: AudioCodecId, sourceRate: number): number[] {
  const preferred = codec === 'opus' ? [48_000] : [48_000, 44_100]
  return [sourceRate, ...preferred.filter((r) => r !== sourceRate)]
}

/** H.264 and VP9 4:2:0 require even dimensions. */
export function hasEvenDimensions(width: number, height: number): boolean {
  return width % 2 === 0 && height % 2 === 0
}
