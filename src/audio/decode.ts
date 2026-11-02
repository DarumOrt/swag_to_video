import type { DecodedAudio } from './types'

/**
 * Sample rate the source is decoded to. decodeAudioData always resamples to its context's rate and
 * the source rate is not known up front, so we fix one: 48 kHz suits both analysis and export
 * (Opus requires it, AAC handles it).
 */
export const DEFAULT_DECODE_SAMPLE_RATE = 48000

export interface DecodeOptions {
  sampleRate?: number
}

/**
 * Decodes an audio file with Web Audio. Main thread only (OfflineAudioContext is not available in
 * workers). An ArrayBuffer input is copied, so the caller's buffer stays usable.
 */
export async function decodeAudio(
  input: Blob | ArrayBuffer,
  options: DecodeOptions = {},
): Promise<DecodedAudio> {
  const sampleRate = options.sampleRate ?? DEFAULT_DECODE_SAMPLE_RATE
  const data = input instanceof ArrayBuffer ? input.slice(0) : await input.arrayBuffer()
  const context = new OfflineAudioContext(1, 1, sampleRate)
  const buffer = await context.decodeAudioData(data)
  const channels: Float32Array[] = []
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = new Float32Array(buffer.length)
    buffer.copyFromChannel(channel, c)
    channels.push(channel)
  }
  return { sampleRate: buffer.sampleRate, channels, durationSec: buffer.length / buffer.sampleRate }
}
