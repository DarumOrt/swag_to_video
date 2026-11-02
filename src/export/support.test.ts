import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_OUTPUT, type OutputSettings } from '@/shared'
import { checkExportSupport } from './support'

const out = (patch: Partial<OutputSettings>): OutputSettings => ({ ...DEFAULT_OUTPUT, ...patch })

/** Fake WebCodecs: `accept` decides which configs are supported. */
function stubCodecs(
  acceptVideo: (c: VideoEncoderConfig) => boolean,
  acceptAudio: (c: AudioEncoderConfig) => boolean = () => true,
) {
  vi.stubGlobal('VideoEncoder', {
    isConfigSupported: async (config: VideoEncoderConfig) => ({
      supported: acceptVideo(config),
      config,
    }),
  })
  vi.stubGlobal('AudioEncoder', {
    isConfigSupported: async (config: AudioEncoderConfig) => ({
      supported: acceptAudio(config),
      config,
    }),
  })
}

const stereo48k = { sampleRate: 48_000, numberOfChannels: 2 }

afterEach(() => vi.unstubAllGlobals())

describe('checkExportSupport', () => {
  it('explains when WebCodecs is missing', async () => {
    vi.stubGlobal('VideoEncoder', undefined)
    const result = await checkExportSupport(out({}), stereo48k)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/WebCodecs/)
  })

  it('prefers hardware H.264 High with AAC for MP4', async () => {
    stubCodecs(() => true)
    const result = await checkExportSupport(out({}), stereo48k)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.video.config.codec).toBe('avc1.640028')
    expect(result.config.video.hardware).toBe(true)
    expect(result.config.video.config.avc).toEqual({ format: 'avc' })
    expect(result.config.audio?.config.codec).toBe('mp4a.40.2')
  })

  it('falls back to software, then to a lower profile', async () => {
    stubCodecs((c) => c.hardwareAcceleration !== 'prefer-hardware' && c.codec.startsWith('avc1.4d'))
    const result = await checkExportSupport(out({}), stereo48k)
    expect(result.ok && result.config.video.config.codec).toBe('avc1.4d0028')
    expect(result.ok && result.config.video.hardware).toBe(false)
  })

  it('resamples audio when the source rate is not supported', async () => {
    stubCodecs(
      () => true,
      (c) => c.sampleRate === 48_000,
    )
    const result = await checkExportSupport(out({ container: 'webm' }), {
      sampleRate: 44_100,
      numberOfChannels: 6,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.audio?.config).toMatchObject({
      codec: 'opus',
      sampleRate: 48_000,
      numberOfChannels: 2,
    })
    expect(result.config.audio?.sourceSampleRate).toBe(44_100)
  })

  it('uses software VP9 even when hardware is preferred', async () => {
    stubCodecs(() => true)
    const result = await checkExportSupport(out({ container: 'webm' }), null)
    expect(result.ok && result.config.video.config.hardwareAcceleration).toBe('prefer-software')
  })

  it('rejects odd sizes and transparent MP4', async () => {
    stubCodecs(() => true)
    expect((await checkExportSupport(out({ width: 1081 }), null)).ok).toBe(false)
    expect((await checkExportSupport(out({ transparent: true }), null)).ok).toBe(false)
  })

  it('suggests another format when nothing fits', async () => {
    stubCodecs(() => false)
    const result = await checkExportSupport(out({ width: 2160, height: 3840 }), null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/WebM/)
  })

  it('works without audio', async () => {
    stubCodecs(() => true)
    const result = await checkExportSupport(out({}), null)
    expect(result.ok && result.config.audio).toBeNull()
  })
})
