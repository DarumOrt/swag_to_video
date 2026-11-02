import { describe, expect, it } from 'vitest'
import { DEFAULT_OUTPUT, type OutputSettings } from '@/shared'
import {
  audioSampleRateCandidates,
  audioSamplesUntilFrameEnd,
  avcCodecString,
  avcLevelFor,
  defaultVideoBitrate,
  frameDurationUs,
  frameTimestampUs,
  isKeyFrame,
  videoBitrateFor,
  videoCodecCandidates,
  vp9LevelFor,
} from './codecs'

const out = (patch: Partial<OutputSettings>): OutputSettings => ({ ...DEFAULT_OUTPUT, ...patch })

describe('frame timestamps', () => {
  it('maps frame index to microseconds', () => {
    expect(frameTimestampUs(0, 30)).toBe(0)
    expect(frameTimestampUs(1, 30)).toBe(33_333)
    expect(frameTimestampUs(30, 30)).toBe(1_000_000)
    expect(frameTimestampUs(60, 60)).toBe(1_000_000)
    expect(frameTimestampUs(24 * 300, 24)).toBe(300_000_000)
  })

  it('durations tile without drift', () => {
    for (const fps of [24, 30, 60] as const) {
      let sum = 0
      for (let i = 0; i < fps * 10; i++) sum += frameDurationUs(i, fps)
      expect(sum).toBe(10_000_000)
    }
  })

  it('places key frames every 2 seconds', () => {
    expect(isKeyFrame(0, 30)).toBe(true)
    expect(isKeyFrame(59, 30)).toBe(false)
    expect(isKeyFrame(60, 30)).toBe(true)
    expect(isKeyFrame(120, 60)).toBe(true)
  })

  it('audio covers video up to the end of each frame', () => {
    expect(audioSamplesUntilFrameEnd(0, 30, 48_000)).toBe(1_600)
    expect(audioSamplesUntilFrameEnd(29, 30, 48_000)).toBe(48_000)
    expect(audioSamplesUntilFrameEnd(0, 30, 44_100)).toBe(1_470)
    expect(audioSamplesUntilFrameEnd(0, 24, 44_100)).toBe(1_838) // 1837.5 rounded up
  })
})

describe('bitrate', () => {
  it('scales with resolution and fps', () => {
    const b1080p30 = defaultVideoBitrate(1080, 1920, 30)
    const b1080p60 = defaultVideoBitrate(1080, 1920, 60)
    const b4k30 = defaultVideoBitrate(2160, 3840, 30)
    expect(b1080p30).toBeGreaterThan(7_000_000)
    expect(b1080p30).toBeLessThan(10_000_000)
    expect(b1080p60).toBeGreaterThan(b1080p30)
    expect(b1080p60).toBeLessThan(2 * b1080p30)
    expect(b4k30).toBeCloseTo(4 * b1080p30, -6)
  })

  it('gives VP9 less than H.264 and clamps', () => {
    expect(defaultVideoBitrate(1080, 1920, 30, 'vp9')).toBeLessThan(
      defaultVideoBitrate(1080, 1920, 30),
    )
    expect(defaultVideoBitrate(16, 16, 24)).toBe(1_000_000)
    expect(defaultVideoBitrate(7680, 4320, 60)).toBe(100_000_000)
  })

  it('respects a user bitrate', () => {
    expect(videoBitrateFor(out({ videoBitrate: 5_000_000 }), 'avc')).toBe(5_000_000)
    expect(videoBitrateFor(out({}), 'avc')).toBe(defaultVideoBitrate(1080, 1920, 30))
  })
})

describe('codec levels', () => {
  it('picks the lowest H.264 level that fits', () => {
    expect(avcLevelFor(1280, 720, 30)).toBe(31)
    expect(avcLevelFor(1080, 1920, 30)).toBe(40)
    expect(avcLevelFor(1080, 1920, 60)).toBe(42)
    expect(avcLevelFor(2160, 3840, 30)).toBe(51)
    expect(avcLevelFor(2160, 3840, 60)).toBe(52)
    expect(avcLevelFor(100_000, 100_000, 60)).toBeNull()
  })

  it('formats avc1 codec strings', () => {
    expect(avcCodecString(0x64, 40)).toBe('avc1.640028')
    expect(avcCodecString(0x42, 31)).toBe('avc1.42001f')
  })

  it('picks VP9 levels', () => {
    expect(vp9LevelFor(1080, 1920, 30)).toBe('40')
    expect(vp9LevelFor(1080, 1920, 60)).toBe('41')
    expect(vp9LevelFor(2160, 3840, 30)).toBe('50')
    expect(vp9LevelFor(2160, 3840, 60)).toBe('51')
  })
})

describe('codec candidates', () => {
  it('MP4 tries H.264 High → Main → Baseline', () => {
    const list = videoCodecCandidates(out({ container: 'mp4' }))
    expect(list.map((c) => c.codecString)).toEqual(['avc1.640028', 'avc1.4d0028', 'avc1.420028'])
  })

  it('WebM tries VP9 then VP8, but only VP9 for transparency', () => {
    expect(videoCodecCandidates(out({ container: 'webm' })).map((c) => c.codec)).toEqual([
      'vp9',
      'vp8',
    ])
    expect(
      videoCodecCandidates(out({ container: 'webm', transparent: true })).map((c) => c.codec),
    ).toEqual(['vp9'])
  })

  it('tries the source sample rate first', () => {
    expect(audioSampleRateCandidates('aac', 44_100)).toEqual([44_100, 48_000])
    expect(audioSampleRateCandidates('aac', 22_050)).toEqual([22_050, 48_000, 44_100])
    expect(audioSampleRateCandidates('opus', 44_100)).toEqual([44_100, 48_000])
  })
})
