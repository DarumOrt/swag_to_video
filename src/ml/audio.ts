/**
 * Minimal decode → mono 16 kHz for Whisper. Temporary: will be replaced by the audio module's
 * resampler once it exists. Main thread only (OfflineAudioContext is not available in workers).
 */
import { SAMPLE_RATE as WHISPER_SAMPLE_RATE } from './constants'

export { WHISPER_SAMPLE_RATE }

export async function toMono16k(source: Blob | ArrayBuffer): Promise<Float32Array> {
  const bytes = source instanceof Blob ? await source.arrayBuffer() : source
  const decodeContext = new OfflineAudioContext(1, 1, 44100)
  const decoded = await decodeContext.decodeAudioData(bytes)

  const length = Math.ceil(decoded.duration * WHISPER_SAMPLE_RATE)
  const context = new OfflineAudioContext(1, length, WHISPER_SAMPLE_RATE)
  const node = context.createBufferSource()
  node.buffer = decoded
  // A mono destination downmixes channels ("speakers" interpretation averages L/R).
  node.connect(context.destination)
  node.start()
  const rendered = await context.startRendering()
  return rendered.getChannelData(0)
}
