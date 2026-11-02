/**
 * Feature detection: picks a video/audio encoder config the browser actually supports
 * for the given OutputSettings, or explains why export is impossible.
 */

import type { OutputSettings } from '@/shared'
import {
  audioCodecFor,
  audioCodecString,
  audioSampleRateCandidates,
  defaultAudioBitrate,
  hasEvenDimensions,
  videoBitrateFor,
  videoCodecCandidates,
  type AudioCodecId,
  type VideoCodecId,
} from './codecs'

export interface ResolvedVideoConfig {
  codec: VideoCodecId
  label: string
  /** Ready to pass to `VideoEncoder.configure`. */
  config: VideoEncoderConfig
  /** True when the browser accepted `prefer-hardware`. */
  hardware: boolean
}

export interface ResolvedAudioConfig {
  codec: AudioCodecId
  /** Ready to pass to `AudioEncoder.configure`. */
  config: AudioEncoderConfig
  /** Source must be resampled to `config.sampleRate` when it differs. */
  sourceSampleRate: number
}

export interface ResolvedExportConfig {
  output: OutputSettings
  video: ResolvedVideoConfig
  /** null when exporting without sound. */
  audio: ResolvedAudioConfig | null
}

export type ExportSupport =
  { ok: true; config: ResolvedExportConfig } | { ok: false; reason: string }

export interface AudioSpec {
  sampleRate: number
  numberOfChannels: number
}

/** Output channel count: mono stays mono, everything else is mixed down to stereo. */
export function outputChannelCount(sourceChannels: number): number {
  return sourceChannels <= 1 ? 1 : 2
}

async function isVideoSupported(config: VideoEncoderConfig): Promise<boolean> {
  try {
    const result = await VideoEncoder.isConfigSupported(config)
    return result.supported === true
  } catch {
    // isConfigSupported throws TypeError for malformed configs (e.g. odd sizes on some codecs).
    return false
  }
}

async function isAudioSupported(config: AudioEncoderConfig): Promise<boolean> {
  try {
    const result = await AudioEncoder.isConfigSupported(config)
    return result.supported === true
  } catch {
    return false
  }
}

export async function resolveVideoConfig(
  output: OutputSettings,
  options: { preferHardware?: boolean } = {},
): Promise<ResolvedVideoConfig | null> {
  const preferHardware = options.preferHardware ?? true

  for (const candidate of videoCodecCandidates(output)) {
    // Hardware VP9 encoders were measured ~2× slower than libvpx (1080×1920@30: 26 vs 51 fps),
    // so "prefer hardware" applies to H.264 only.
    const accelerations: HardwareAcceleration[] =
      preferHardware && candidate.codec === 'avc'
        ? ['prefer-hardware', 'no-preference']
        : ['prefer-software', 'no-preference']
    for (const hardwareAcceleration of accelerations) {
      const config: VideoEncoderConfig = {
        codec: candidate.codecString,
        width: output.width,
        height: output.height,
        bitrate: videoBitrateFor(output, candidate.codec),
        bitrateMode: 'variable',
        framerate: output.fps,
        hardwareAcceleration,
        latencyMode: 'quality',
        ...(candidate.codec === 'avc' ? { avc: { format: 'avc' as const } } : {}),
        ...(output.transparent ? { alpha: 'keep' as const } : {}),
      }
      if (await isVideoSupported(config)) {
        return {
          codec: candidate.codec,
          label: candidate.label,
          config,
          hardware: hardwareAcceleration === 'prefer-hardware',
        }
      }
    }
  }
  return null
}

export async function resolveAudioConfig(
  output: OutputSettings,
  source: AudioSpec,
): Promise<ResolvedAudioConfig | null> {
  const codec = audioCodecFor(output.container)
  const numberOfChannels = outputChannelCount(source.numberOfChannels)
  for (const sampleRate of audioSampleRateCandidates(codec, source.sampleRate)) {
    const config: AudioEncoderConfig = {
      codec: audioCodecString(codec),
      sampleRate,
      numberOfChannels,
      bitrate: defaultAudioBitrate(codec),
    }
    if (await isAudioSupported(config)) {
      return { codec, config, sourceSampleRate: source.sampleRate }
    }
  }
  return null
}

/**
 * Picks a supported encoder configuration for `output` (and `audio`, if given).
 * Never throws: returns `{ ok: false, reason }` with a user-facing message (RU) instead.
 */
export async function checkExportSupport(
  output: OutputSettings,
  audio: AudioSpec | null,
  options: { preferHardware?: boolean } = {},
): Promise<ExportSupport> {
  if (typeof VideoEncoder === 'undefined') {
    return {
      ok: false,
      reason:
        'Браузер не поддерживает WebCodecs (VideoEncoder). Экспорт работает в Chrome или Edge.',
    }
  }
  if (!hasEvenDimensions(output.width, output.height)) {
    return {
      ok: false,
      reason: `Ширина и высота должны быть чётными (сейчас ${output.width}×${output.height}).`,
    }
  }
  if (output.transparent && output.container !== 'webm') {
    return { ok: false, reason: 'Прозрачный фон возможен только в WebM (VP9 с альфа-каналом).' }
  }

  const video = await resolveVideoConfig(output, options)
  if (!video) {
    if (output.transparent) {
      return {
        ok: false,
        reason:
          'Браузер не умеет кодировать видео с прозрачностью (VP9 с альфа-каналом). ' +
          'Выключите прозрачный фон.',
      }
    }
    const what = output.container === 'mp4' ? 'H.264' : 'VP9/VP8'
    return {
      ok: false,
      reason:
        `Браузер не умеет кодировать ${what} в ${output.width}×${output.height} при ${output.fps} fps. ` +
        'Попробуйте меньшее разрешение или fps' +
        (output.container === 'mp4' ? ', либо формат WebM.' : ', либо формат MP4.'),
    }
  }

  if (!audio) return { ok: true, config: { output, video, audio: null } }

  if (typeof AudioEncoder === 'undefined') {
    return {
      ok: false,
      reason: 'Браузер не поддерживает AudioEncoder — видео со звуком экспортировать нельзя.',
    }
  }
  const resolvedAudio = await resolveAudioConfig(output, audio)
  if (!resolvedAudio) {
    const codec = audioCodecFor(output.container) === 'aac' ? 'AAC' : 'Opus'
    return {
      ok: false,
      reason:
        `Браузер не умеет кодировать звук в ${codec}` +
        (output.container === 'mp4' ? ' — попробуйте формат WebM.' : '.'),
    }
  }
  return { ok: true, config: { output, video, audio: resolvedAudio } }
}
