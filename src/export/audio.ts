/**
 * Audio preparation for encoding: planar PCM, channel mixdown, resampling.
 */

/** Planar float PCM. Transferable to a worker, unlike AudioBuffer. */
export interface PcmAudio {
  sampleRate: number
  /** One Float32Array per channel, all the same length. */
  channels: Float32Array[]
}

export type ExportAudio = AudioBuffer | PcmAudio

export function isPcmAudio(audio: ExportAudio): audio is PcmAudio {
  return 'channels' in audio && Array.isArray(audio.channels)
}

export function toPcm(audio: ExportAudio): PcmAudio {
  if (isPcmAudio(audio)) return audio
  const channels: Float32Array[] = []
  for (let c = 0; c < audio.numberOfChannels; c++) channels.push(audio.getChannelData(c))
  return { sampleRate: audio.sampleRate, channels }
}

export function pcmLength(pcm: PcmAudio): number {
  return pcm.channels[0]?.length ?? 0
}

/** Keeps mono as is; for 2+ channels keeps the first two (front L/R). */
export function mixdown(pcm: PcmAudio, numberOfChannels: number): PcmAudio {
  if (pcm.channels.length === numberOfChannels) return pcm
  const first = pcm.channels[0]
  if (!first) return pcm
  if (numberOfChannels === 1) {
    // Average all channels into one.
    const mono = new Float32Array(first.length)
    for (const ch of pcm.channels)
      for (let i = 0; i < mono.length; i++) mono[i]! += ch[i]! / pcm.channels.length
    return { sampleRate: pcm.sampleRate, channels: [mono] }
  }
  const second = pcm.channels[1] ?? first
  return { sampleRate: pcm.sampleRate, channels: [first, second] }
}

/** Linear-interpolation resampler. Fallback for workers (no OfflineAudioContext there). */
export function resampleLinear(pcm: PcmAudio, targetRate: number): PcmAudio {
  if (pcm.sampleRate === targetRate) return pcm
  const ratio = pcm.sampleRate / targetRate
  const inLength = pcmLength(pcm)
  const outLength = Math.round((inLength * targetRate) / pcm.sampleRate)
  const channels = pcm.channels.map((input) => {
    const out = new Float32Array(outLength)
    for (let i = 0; i < outLength; i++) {
      const pos = i * ratio
      const i0 = Math.floor(pos)
      const frac = pos - i0
      const a = input[Math.min(i0, inLength - 1)] ?? 0
      const b = input[Math.min(i0 + 1, inLength - 1)] ?? 0
      out[i] = a + (b - a) * frac
    }
    return out
  })
  return { sampleRate: targetRate, channels }
}

/** Band-limited resampling via OfflineAudioContext when available, linear otherwise. */
export async function resample(pcm: PcmAudio, targetRate: number): Promise<PcmAudio> {
  if (pcm.sampleRate === targetRate) return pcm
  if (typeof OfflineAudioContext === 'undefined') return resampleLinear(pcm, targetRate)
  const inLength = pcmLength(pcm)
  const outLength = Math.round((inLength * targetRate) / pcm.sampleRate)
  const ctx = new OfflineAudioContext(pcm.channels.length, outLength, targetRate)
  const buffer = ctx.createBuffer(pcm.channels.length, inLength, pcm.sampleRate)
  pcm.channels.forEach((ch, c) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, c))
  const node = ctx.createBufferSource()
  node.buffer = buffer
  node.connect(ctx.destination)
  node.start()
  const rendered = await ctx.startRendering()
  return toPcm(rendered)
}

/**
 * Builds an `AudioData` (f32-planar) for samples [start, end) of `pcm`.
 * Timestamp is derived from the sample index, so audio never drifts relative to video.
 */
export function makeAudioData(pcm: PcmAudio, start: number, end: number): AudioData {
  const frames = end - start
  const numberOfChannels = pcm.channels.length
  const data = new Float32Array(frames * numberOfChannels)
  pcm.channels.forEach((ch, c) => data.set(ch.subarray(start, end), c * frames))
  return new AudioData({
    format: 'f32-planar',
    sampleRate: pcm.sampleRate,
    numberOfFrames: frames,
    numberOfChannels,
    timestamp: Math.round((start * 1_000_000) / pcm.sampleRate),
    data,
  })
}
