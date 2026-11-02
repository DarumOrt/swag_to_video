/**
 * Synthetic `Timeline` for development and tests while the real analyzer is not ready.
 * A 4/4 groove: kick on every beat (low band), snare on 2 and 4 (mid), hats on eighths (high),
 * a wandering "melody" peak, and RU/EN lyrics with one word per beat. Fully determined by options.
 */

import {
  TIMELINE_SCHEMA_VERSION,
  type Accent,
  type LyricLine,
  type Timeline,
  type TimeRange,
} from '@/shared'
import { createRng } from '../random'

export interface FakeTimelineOptions {
  durationSec?: number
  bpm?: number
  seed?: number
  /** Feature grid rate, frames per second. */
  featureRate?: number
  binCount?: number
  withLyrics?: boolean
}

const MIN_HZ = 20
const MAX_HZ = 20000

const WORDS_RU = 'свет ночного города горит ярче звёзд мы летим сквозь шум и бас'.split(' ')
const WORDS_EN = 'turn the bass up feel the night we are the sound of now'.split(' ')
const WORDS_PER_LINE = 6

export function createFakeTimeline(options: FakeTimelineOptions = {}): Timeline {
  const durationSec = options.durationSec ?? 30
  const bpm = options.bpm ?? 120
  const rate = options.featureRate ?? 60
  const binCount = options.binCount ?? 96
  const rng = createRng(options.seed ?? 1)

  const frameCount = Math.max(1, Math.ceil(durationSec * rate))
  const beatSec = 60 / bpm

  const spectrum = new Float32Array(frameCount * binCount)
  const rms = new Float32Array(frameCount)
  const peak = new Float32Array(frameCount)
  const lufs = new Float32Array(frameCount)
  const low = new Float32Array(frameCount)
  const mid = new Float32Array(frameCount)
  const high = new Float32Array(frameCount)
  const correlation = new Float32Array(frameCount)
  const width = new Float32Array(frameCount)

  const binHz = Array.from({ length: binCount }, (_, b) =>
    binCount > 1 ? MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, b / (binCount - 1)) : MIN_HZ,
  )

  for (let f = 0; f < frameCount; f++) {
    const t = f / rate
    // Slow 16-second energy swell, quiet first two bars.
    const energy = (t < beatSec * 8 ? 0.55 : 1) * (0.75 + 0.25 * Math.sin((2 * Math.PI * t) / 16))

    const sinceBeat = t % beatSec
    const beatIndex = Math.floor(t / beatSec)
    const kick = Math.exp(-sinceBeat / 0.11)
    const snare = beatIndex % 2 === 1 ? Math.exp(-sinceBeat / 0.09) : 0
    const hat = 0.7 * Math.exp(-(t % (beatSec / 2)) / 0.035)
    const melodyHz = 420 * Math.pow(2, 1.6 * Math.sin(t * 0.9) + 0.5 * Math.sin(t * 2.3))

    low[f] = clamp01(energy * (0.15 + 0.85 * kick))
    mid[f] = clamp01(energy * (0.3 + 0.15 * Math.sin(t * 1.7) + 0.45 * snare) + 0.05 * rng())
    high[f] = clamp01(energy * (0.15 + 0.75 * hat) + 0.05 * rng())

    const row = f * binCount
    let sum = 0
    for (let b = 0; b < binCount; b++) {
      const hz = binHz[b] ?? MIN_HZ
      const x = b / Math.max(binCount - 1, 1)
      const v =
        energy *
          (0.5 * (1 - 0.45 * x) +
            0.85 * kick * bump(hz, 55, 0.7) +
            0.5 * snare * bump(hz, 1800, 1.1) +
            0.45 * bump(hz, melodyHz, 0.35) +
            0.55 * hat * bump(hz, 9000, 0.9)) +
        0.06 * rng()
      const c = clamp01(v)
      spectrum[row + b] = c
      sum += c
    }

    const loud = sum / binCount
    rms[f] = clamp01(0.15 + 0.6 * loud + 0.15 * kick * energy)
    peak[f] = clamp01((rms[f] ?? 0) * 1.35 + 0.1 * kick)
    lufs[f] = -24 + 12 * energy
    correlation[f] = 0.55 + 0.35 * Math.sin(t * 0.5)
    width[f] = clamp01(0.35 + 0.25 * Math.sin(t * 0.31))
  }

  const beats: number[] = []
  for (let b = 0; b * beatSec < durationSec; b++) beats.push(b * beatSec)
  const downbeats = beats.filter((_, i) => i % 4 === 0)
  const onsets: number[] = []
  for (let h = 0; (h * beatSec) / 2 < durationSec; h++) onsets.push((h * beatSec) / 2)

  const { lines, accents, vocal } =
    options.withLyrics === false
      ? { lines: [], accents: [], vocal: [] }
      : fakeLyrics(beats, beatSec, durationSec)

  return {
    version: TIMELINE_SCHEMA_VERSION,
    audio: {
      durationSec,
      sampleRate: 48000,
      channelCount: 2,
      features: {
        rate,
        frameCount,
        spectrum: { binCount, minHz: MIN_HZ, maxHz: MAX_HZ, data: spectrum },
        rms,
        peak,
        lufsShortTerm: lufs,
        bands: { low, mid, high },
        stereo: { correlation, width },
      },
      rhythm: {
        bpm,
        beats: Float32Array.from(beats),
        downbeats: Float32Array.from(downbeats),
        onsets: Float32Array.from(onsets),
        vocalOnsets: Float32Array.from(lines.flatMap((l) => l.words.map((w) => w.start ?? 0))),
      },
      vocalActivity: vocal,
    },
    lyrics: lines.length > 0 ? { language: 'mixed', lines } : null,
    accents,
  }
}

/** One word per beat starting at bar 3, lines of 6 words alternating RU / EN, 2 beats rest between. */
function fakeLyrics(
  beats: number[],
  beatSec: number,
  durationSec: number,
): { lines: LyricLine[]; accents: Accent[]; vocal: TimeRange[] } {
  const lines: LyricLine[] = []
  const accents: Accent[] = []
  let beat = 8
  for (let li = 0; beat + WORDS_PER_LINE <= beats.length; li++) {
    const vocab = li % 2 === 0 ? WORDS_RU : WORDS_EN
    const words = Array.from({ length: WORDS_PER_LINE }, (_, wi) => {
      const start = beats[beat + wi] ?? 0
      return {
        id: `w${li}-${wi}`,
        text: vocab[(li * WORDS_PER_LINE + wi) % vocab.length] ?? '',
        start,
        end: Math.min(start + beatSec * 0.85, durationSec),
        confidence: 0.9,
        timingSource: 'manual' as const,
      }
    })
    lines.push({ id: `l${li}`, section: li < 4 ? 'Куплет 1' : 'Припев', words })
    accents.push({
      id: `a${li}`,
      wordId: `w${li}-0`,
      effect: 'zoom-punch',
      preRollSec: 0.05,
      durationSec: 0.3,
      intensity: 0.8,
      params: {},
    })
    beat += WORDS_PER_LINE + 2
  }
  const first = lines[0]?.words[0]?.start
  const last = lines.at(-1)?.words.at(-1)?.end
  const vocal = first != null && last != null ? [{ start: first, end: last }] : []
  return { lines, accents, vocal }
}

function bump(hz: number, centerHz: number, octaves: number): number {
  const d = Math.log2(hz / centerHz) / octaves
  return Math.exp(-0.5 * d * d)
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
