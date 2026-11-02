/**
 * Offline frame-by-frame export: FrameRenderer → VideoFrame → VideoEncoder ─┐
 *                                 PCM → AudioData → AudioEncoder ───────────┴→ mediabunny → file
 *
 * Frames are encoded as a stream (nothing accumulates in memory except the muxed file itself when
 * writing to a Blob; pass `writable` for long/4K exports). Audio is interleaved with video: after
 * frame N we encode audio up to the end of frame N, so the muxer never buffers much of either track.
 */

import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  WebMOutputFormat,
  type StreamTargetChunk,
  type Target,
} from 'mediabunny'
import { frameCountFor, type FrameRenderer, type OutputSettings, type Timeline } from '@/shared'
import {
  makeAudioData,
  mixdown,
  pcmLength,
  resample,
  toPcm,
  type ExportAudio,
  type PcmAudio,
} from './audio'
import { audioSamplesUntilFrameEnd, frameDurationUs, frameTimestampUs, isKeyFrame } from './codecs'
import { checkExportSupport, outputChannelCount, type ResolvedExportConfig } from './support'

export interface ExportProgress {
  /** Frames handed to the encoder so far. */
  frame: number
  totalFrames: number
  /** 0..1 */
  fraction: number
  elapsedSec: number
  /** Average export speed, frames per second of wall-clock time. */
  framesPerSec: number
  /** Estimated time left; null until there is enough data. */
  etaSec: number | null
}

export interface ExportStats {
  frames: number
  durationSec: number
  elapsedSec: number
  framesPerSec: number
  /** Export speed relative to real time (2 = twice as fast as playback). */
  realtimeFactor: number
  bytes: number
}

export interface ExportResult {
  /** The file, when exporting in memory. null when written to `writable`. */
  blob: Blob | null
  mimeType: string
  fileExtension: string
  config: ResolvedExportConfig
  stats: ExportStats
}

export interface ExportOptions {
  /** A fresh renderer instance; exportVideo calls init/dispose on it with its own canvas. */
  renderer: FrameRenderer
  timeline: Timeline
  scene: unknown
  output: OutputSettings
  /** null = video without sound. */
  audio: ExportAudio | null
  durationSec: number
  /**
   * Stream the file here instead of building a Blob (File System Access `FileSystemWritableFileStream`
   * or OPFS writable). Required for long 4K exports to stay within memory.
   */
  writable?: WritableStream<StreamTargetChunk>
  /** Pre-resolved config from `checkExportSupport` (skips the detection step). */
  config?: ResolvedExportConfig
  preferHardware?: boolean
  onProgress?: (progress: ExportProgress) => void
  signal?: AbortSignal
}

export class ExportError extends Error {
  override name = 'ExportError'
}

/** Max frames waiting inside VideoEncoder before we pause rendering. */
const MAX_VIDEO_QUEUE = 8
const MAX_AUDIO_QUEUE = 16
const PROGRESS_INTERVAL_MS = 100
/** Audio frames per AudioData chunk fed to the encoder (cap; usually one video frame's worth). */
const MAX_AUDIO_CHUNK = 4096

function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function abortError(): DOMException {
  return new DOMException('Экспорт отменён', 'AbortError')
}

export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  const { renderer, output: settings, signal, onProgress } = options
  signal?.throwIfAborted()

  let pcm: PcmAudio | null = options.audio ? toPcm(options.audio) : null
  let config = options.config
  if (!config) {
    const support = await checkExportSupport(
      settings,
      pcm ? { sampleRate: pcm.sampleRate, numberOfChannels: pcm.channels.length } : null,
      { preferHardware: options.preferHardware },
    )
    if (!support.ok) throw new ExportError(support.reason)
    config = support.config
  }
  const { video, audio } = config
  const { width, height, fps } = settings

  if (pcm && audio) {
    pcm = mixdown(pcm, outputChannelCount(pcm.channels.length))
    pcm = await resample(pcm, audio.config.sampleRate)
  } else {
    pcm = null
  }

  const totalFrames = frameCountFor(options.durationSec, fps)
  // Audio stops where video stops; shorter audio simply ends early.
  const totalAudioSamples = pcm
    ? Math.min(pcmLength(pcm), Math.round(options.durationSec * pcm.sampleRate))
    : 0

  // --- Muxer ---------------------------------------------------------------------------------
  const target: Target = options.writable
    ? new StreamTarget(options.writable, { chunked: true })
    : new BufferTarget()
  const format =
    settings.container === 'mp4'
      ? new Mp4OutputFormat({ fastStart: options.writable ? false : 'in-memory' })
      : new WebMOutputFormat()
  const muxer = new Output({ format, target })
  const videoSource = new EncodedVideoPacketSource(video.codec)
  muxer.addVideoTrack(videoSource, { frameRate: fps })
  const audioSource = audio && pcm ? new EncodedAudioPacketSource(audio.codec) : null
  if (audioSource) muxer.addAudioTrack(audioSource)

  // --- Encoders ------------------------------------------------------------------------------
  let failure: unknown = null
  // Pending backpressure waits. A failed (closed) encoder never fires 'dequeue' again,
  // so errors and abort must wake the waits too, or the loop would hang forever.
  const waiters = new Set<() => void>()
  const wakeAll = () => {
    for (const wake of waiters) wake()
    waiters.clear()
  }
  const fail = (error: unknown) => {
    failure ??= error
    wakeAll()
  }
  signal?.addEventListener('abort', wakeAll, { once: true })
  const stopped = () => failure !== null || signal?.aborted === true
  const waitForQueue = async (encoder: VideoEncoder | AudioEncoder, max: number) => {
    while (encoder.encodeQueueSize > max && !stopped()) {
      await new Promise<void>((resolve) => {
        waiters.add(resolve)
        encoder.addEventListener(
          'dequeue',
          () => {
            waiters.delete(resolve)
            resolve()
          },
          { once: true },
        )
      })
    }
  }
  // Muxer adds must happen in order; chain them and remember the tail for backpressure.
  let videoMux: Promise<void> = Promise.resolve()
  let audioMux: Promise<void> = Promise.resolve()
  let bytes = 0

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      bytes += chunk.byteLength
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      videoMux = videoMux.then(() => videoSource.add(packet, meta)).catch(fail)
    },
    error: fail,
  })
  videoEncoder.configure(video.config)

  let audioEncoder: AudioEncoder | null = null
  if (audio && audioSource) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        bytes += chunk.byteLength
        const packet = EncodedPacket.fromEncodedChunk(chunk)
        audioMux = audioMux.then(() => audioSource.add(packet, meta)).catch(fail)
      },
      error: fail,
    })
    audioEncoder.configure(audio.config)
  }

  const canvas = createCanvas(width, height)
  let rendererReady = false

  const cleanup = () => {
    for (const encoder of [videoEncoder, audioEncoder]) {
      if (encoder && encoder.state !== 'closed') encoder.close()
    }
    if (rendererReady) renderer.dispose()
  }

  try {
    await renderer.init({
      canvas,
      width,
      height,
      fps,
      timeline: options.timeline,
      scene: options.scene,
    })
    rendererReady = true
    await muxer.start()

    const startedAt = performance.now()
    let lastReport = -Infinity
    let audioCursor = 0

    const report = (frame: number) => {
      if (!onProgress) return
      const elapsedSec = (performance.now() - startedAt) / 1000
      const framesPerSec = elapsedSec > 0 ? frame / elapsedSec : 0
      onProgress({
        frame,
        totalFrames,
        fraction: totalFrames > 0 ? frame / totalFrames : 1,
        elapsedSec,
        framesPerSec,
        etaSec: frame >= 10 && framesPerSec > 0 ? (totalFrames - frame) / framesPerSec : null,
      })
    }

    const throwIfStopped = () => {
      if (signal?.aborted) throw abortError()
      if (failure) throw failure
    }

    for (let frame = 0; frame < totalFrames; frame++) {
      throwIfStopped()
      // Backpressure: encoder queue, then muxer/writer.
      await waitForQueue(videoEncoder, MAX_VIDEO_QUEUE)
      await videoMux
      throwIfStopped()

      await renderer.renderFrame(frame)
      const videoFrame = new VideoFrame(canvas, {
        timestamp: frameTimestampUs(frame, fps),
        duration: frameDurationUs(frame, fps),
        alpha: settings.transparent ? 'keep' : 'discard',
      })
      try {
        videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame(frame, fps) })
      } finally {
        videoFrame.close()
      }

      if (audioEncoder && pcm) {
        const until = Math.min(
          totalAudioSamples,
          audioSamplesUntilFrameEnd(frame, fps, pcm.sampleRate),
        )
        while (audioCursor < until) {
          await waitForQueue(audioEncoder, MAX_AUDIO_QUEUE)
          throwIfStopped()
          const end = Math.min(until, audioCursor + MAX_AUDIO_CHUNK)
          const data = makeAudioData(pcm, audioCursor, end)
          try {
            audioEncoder.encode(data)
          } finally {
            data.close()
          }
          audioCursor = end
        }
      }

      const now = performance.now()
      if (now - lastReport >= PROGRESS_INTERVAL_MS) {
        lastReport = now
        report(frame + 1)
      }
    }

    await videoEncoder.flush()
    await audioEncoder?.flush()
    await videoMux
    await audioMux
    if (failure) throw failure
    if (signal?.aborted) throw abortError()

    await muxer.finalize()
    report(totalFrames)

    const elapsedSec = (performance.now() - startedAt) / 1000
    const buffer = target instanceof BufferTarget ? target.buffer : null
    const mimeType = await muxer.getMimeType()
    const framesPerSec = elapsedSec > 0 ? totalFrames / elapsedSec : 0
    return {
      blob: buffer ? new Blob([buffer], { type: format.mimeType }) : null,
      mimeType,
      fileExtension: format.fileExtension,
      config,
      stats: {
        frames: totalFrames,
        durationSec: totalFrames / fps,
        elapsedSec,
        framesPerSec,
        realtimeFactor: framesPerSec / fps,
        bytes: buffer?.byteLength ?? bytes,
      },
    }
  } catch (error) {
    if (muxer.state !== 'canceled' && muxer.state !== 'finalized')
      await muxer.cancel().catch(() => {})
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    if (error instanceof ExportError) throw error
    throw new ExportError(
      `Экспорт не удался: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    )
  } finally {
    signal?.removeEventListener('abort', wakeAll)
    cleanup()
  }
}
