/**
 * Whisper recognition with word timestamps and per-word confidence. Runs inside the ML worker.
 *
 * We drive `model.generate()` per ≤ 30 s window ourselves instead of using the ASR pipeline:
 * - the pipeline returns no token probabilities, and we need word confidence;
 * - passing `max_new_tokens` skips transformers.js' internal seek loop, so token positions map 1:1
 *   to the probabilities recorded by TokenProbRecorder; seeking is done by decodeWindow().
 */
import {
  AutoProcessor,
  AutoTokenizer,
  LogitsProcessor,
  LogitsProcessorList,
  WhisperForConditionalGeneration,
  env,
  type PreTrainedTokenizer,
  type Processor,
  type ProgressInfo,
  type Tensor,
} from '@huggingface/transformers'
import { configureHub, resolveModel } from '../hub'
import { isKnownHallucination, trimRepetitions } from './filters'
import { TIME_PRECISION, buildWords, decodeWindow, type WordTiming } from './segments'
import type {
  LoadProgress,
  LoadStats,
  RecognizedSegment,
  TranscribeOptions,
  TranscribeResult,
  WhisperLanguage,
  WhisperLoadOptions,
} from './types'
import { WHISPER_MODELS } from './variants'

export const SAMPLE_RATE = 16000
const WINDOW_SEC = 30
/** Whisper's decoder context is 448 tokens; 3 go to the prompt. */
const MAX_NEW_TOKENS = 440
/** Back-to-back repeats of one 1..4-gram beyond this are cut (songs legitimately repeat a few times). */
const MAX_REPEATS = 4
/** Sampling temperature for re-decoding a window that looped until the token limit. */
const FALLBACK_TEMPERATURE = 0.5
const LANGUAGES: WhisperLanguage[] = ['ru', 'en']

export class Cancelled extends Error {
  constructor() {
    super('cancelled')
  }
}

/** Records the probability of each generated token (after all logits processors ran). */
class TokenProbRecorder extends LogitsProcessor {
  /** probs[i] = probability of the token at sequence position i (prompt positions are empty). */
  probs: number[] = []
  private prev: Float32Array | null = null

  _call(input_ids: bigint[][], logits: Tensor): Tensor {
    const ids = input_ids[0]!
    // `logits` is processed in place by the processors after us; by the next call, `prev` holds the
    // final scores the sampler picked the last token from.
    if (this.prev) this.probs[ids.length - 1] = softmaxAt(this.prev, Number(ids[ids.length - 1]))
    this.prev = logits.data as Float32Array
    return logits
  }
}

/** Captures the first-step logits (for language detection). */
class FirstLogitsProbe extends LogitsProcessor {
  logits: Float32Array | null = null

  _call(_input_ids: bigint[][], logits: Tensor): Tensor {
    this.logits ??= (logits.data as Float32Array).slice()
    return logits
  }
}

function softmaxAt(row: Float32Array, index: number): number {
  let max = -Infinity
  for (let i = 0; i < row.length; i++) if (row[i]! > max) max = row[i]!
  let sum = 0
  for (let i = 0; i < row.length; i++) sum += Math.exp(row[i]! - max)
  return Math.exp(row[index]! - max) / sum
}

interface WhisperTokenizer extends PreTrainedTokenizer {
  combineTokensIntoWords(tokens: number[], language?: string): [string[], number[][], number[][]]
}

interface WhisperGenerationConfig {
  decoder_start_token_id: number
  eos_token_id: number | number[]
  no_timestamps_token_id: number
  lang_to_id: Record<string, number>
}

export class WhisperEngine {
  private readonly processor: Processor
  private readonly tokenizer: WhisperTokenizer
  private readonly model: WhisperForConditionalGeneration

  private constructor(
    processor: Processor,
    tokenizer: WhisperTokenizer,
    model: WhisperForConditionalGeneration,
  ) {
    this.processor = processor
    this.tokenizer = tokenizer
    this.model = model
  }

  static async load(
    options: WhisperLoadOptions,
    onProgress: (p: LoadProgress) => void,
  ): Promise<{ engine: WhisperEngine; stats: LoadStats }> {
    configureHub()
    const resolved = resolveModel(WHISPER_MODELS[options.model])
    const started = performance.now()

    let downloadedBytes = 0
    const baseFetch = env.fetch
    env.fetch = async (input, init) => {
      const response = await baseFetch(input, init)
      downloadedBytes += Number(response.headers?.get?.('content-length') ?? 0)
      return response
    }

    const progress_callback = (info: ProgressInfo) => {
      if (info.status === 'progress')
        onProgress({ file: info.file, loaded: info.loaded, total: info.total })
    }
    const common = { revision: resolved.revision, progress_callback }

    try {
      const [processor, tokenizer, model] = await Promise.all([
        AutoProcessor.from_pretrained(resolved.repo, common),
        AutoTokenizer.from_pretrained(resolved.repo, common),
        WhisperForConditionalGeneration.from_pretrained(resolved.repo, {
          ...common,
          device: options.device,
          dtype: { ...options.dtype },
        }),
      ])
      const engine = new WhisperEngine(
        processor,
        tokenizer as WhisperTokenizer,
        model as WhisperForConditionalGeneration,
      )
      return {
        engine,
        stats: {
          elapsedMs: performance.now() - started,
          downloadedBytes,
          repo: resolved.repo,
          revision: resolved.revision,
          mirrored: resolved.mirrored,
        },
      }
    } finally {
      env.fetch = baseFetch
    }
  }

  async dispose(): Promise<void> {
    await this.model.dispose()
  }

  private get config(): WhisperGenerationConfig {
    return this.model.generation_config as unknown as WhisperGenerationConfig
  }

  async transcribe(
    audio: Float32Array,
    options: TranscribeOptions,
    onWindow: (doneSec: number, totalSec: number) => void,
    isCancelled: () => boolean,
  ): Promise<TranscribeResult> {
    const started = performance.now()
    const audioSec = audio.length / SAMPLE_RATE
    const language =
      options.language === 'auto' ? await this.detectLanguage(audio) : options.language
    const regions = options.regions?.length ? options.regions : [{ start: 0, end: audioSec }]
    const totalSec = regions.reduce((s, r) => s + (r.end - r.start), 0)

    const segments: RecognizedSegment[] = []
    const droppedSegments: string[] = []
    let windows = 0
    let retries = 0
    let doneSec = 0

    for (const region of regions) {
      const regionEnd = Math.min(Math.round(region.end * SAMPLE_RATE), audio.length)
      let seek = Math.max(0, Math.round(region.start * SAMPLE_RATE))
      while (regionEnd - seek > 0.2 * SAMPLE_RATE) {
        if (isCancelled()) throw new Cancelled()
        const chunk = audio.subarray(seek, Math.min(seek + WINDOW_SEC * SAMPLE_RATE, regionEnd))
        const offsetSec = seek / SAMPLE_RATE
        let window = await this.transcribeWindow(chunk, language, 0)
        windows++
        if (window.truncated) {
          // Greedy decoding got stuck in a loop: retry once with sampling (Whisper's temperature fallback).
          retries++
          const retry = await this.transcribeWindow(chunk, language, FALLBACK_TEMPERATURE)
          if (!retry.truncated) window = retry
        }

        for (const seg of window.segments) {
          const kept = trimRepetitions(
            seg.words.map((w) => w.text),
            MAX_REPEATS,
          ).map((i) => seg.words[i]!)
          const text = kept.map((w) => w.text).join(' ')
          if (!kept.length || isKnownHallucination(text)) {
            droppedSegments.push(seg.words.map((w) => w.text).join(' '))
            continue
          }
          const flags: RecognizedSegment['flags'] = []
          if (kept.length < seg.words.length) flags.push('repetition')
          if (window.truncated) flags.push('truncated')
          const words = kept.map((w) => ({
            ...w,
            start: round(w.start + offsetSec),
            end: round(w.end + offsetSec),
          }))
          segments.push({
            start: round(seg.start + offsetSec),
            end: Math.max(round(seg.end + offsetSec), words.at(-1)!.end),
            text,
            words,
            flags,
          })
        }

        const advance = Math.round(window.advanceSec * SAMPLE_RATE)
        doneSec += Math.min(advance, regionEnd - seek) / SAMPLE_RATE
        seek += advance
        onWindow(Math.min(doneSec, totalSec), totalSec)
      }
    }

    return {
      language,
      segments,
      words: segments.flatMap((s) => s.words),
      stats: {
        audioSec,
        elapsedMs: performance.now() - started,
        windows,
        retries,
        droppedSegments,
      },
    }
  }

  private async transcribeWindow(
    chunk: Float32Array,
    language: WhisperLanguage,
    temperature: number,
  ) {
    const { input_features } = (await this.processor(chunk)) as { input_features: Tensor }
    const recorder = new TokenProbRecorder()
    const logits_processor = new LogitsProcessorList()
    logits_processor.push(recorder)

    const output = (await this.model.generate({
      inputs: input_features,
      language,
      task: 'transcribe',
      return_timestamps: true,
      return_token_timestamps: true,
      max_new_tokens: MAX_NEW_TOKENS,
      ...(temperature > 0 ? { do_sample: true, temperature } : {}),
      // Encoder positions covered by real audio (2 mel frames each); crops DTW to the audio.
      num_frames: Math.ceil(chunk.length / (TIME_PRECISION * SAMPLE_RATE)),
      logits_processor,
    } as Parameters<WhisperForConditionalGeneration['generate']>[0])) as unknown as {
      sequences: Tensor
      token_timestamps: Tensor
      past_key_values?: { dispose(): Promise<void> }
    }
    // return_token_timestamps implies return_dict_in_generate, which keeps the KV cache alive and hands
    // it to us; on WebGPU those are GPU buffers that leak (device lost after a few windows) unless freed.
    await output.past_key_values?.dispose()

    const sequence = (output.sequences.tolist()[0] as bigint[]).map(Number)
    const times = output.token_timestamps.tolist()[0] as number[]
    const timestampBegin = this.config.no_timestamps_token_id + 1
    const prefix = Math.max(
      sequence.findIndex((t) => t >= timestampBegin),
      0,
    )
    const eos = this.config.eos_token_id
    const decoded = decodeWindow({
      tokens: sequence.slice(prefix),
      eotId: Array.isArray(eos) ? eos[0]! : eos,
      timestampBegin,
      windowSec: chunk.length / SAMPLE_RATE,
    })

    const tokens = sequence.slice(prefix)
    const tokenTimes = times.slice(prefix)
    const tokenProbs = recorder.probs.slice(prefix)
    const segments = decoded.segments.map((seg) => {
      const segTokens = seg.tokenIndices.map((i) => tokens[i]!)
      const [texts, , indices] = this.tokenizer.combineTokensIntoWords(segTokens, undefined)
      const groups = texts.map((text, k) => ({
        text,
        indices: (indices[k] ?? []).map((j) => seg.tokenIndices[j]!),
      }))
      const words: WordTiming[] = buildWords(groups, tokenTimes, tokenProbs, 0, seg.end)
      return { start: seg.start, end: seg.end, words }
    })
    return { segments, advanceSec: decoded.advanceSec, truncated: decoded.truncated }
  }

  /** Picks ru or en from the language-token logits of the loudest 30 s window. */
  private async detectLanguage(audio: Float32Array): Promise<WhisperLanguage> {
    const window = WINDOW_SEC * SAMPLE_RATE
    let bestStart = 0
    let bestEnergy = -1
    for (let start = 0; start < Math.max(audio.length - window, 1); start += 5 * SAMPLE_RATE) {
      let energy = 0
      const end = Math.min(start + window, audio.length)
      for (let i = start; i < end; i += 16) energy += audio[i]! * audio[i]!
      if (energy > bestEnergy) {
        bestEnergy = energy
        bestStart = start
      }
    }

    const { input_features } = (await this.processor(
      audio.subarray(bestStart, bestStart + window),
    )) as {
      input_features: Tensor
    }
    const probe = new FirstLogitsProbe()
    const logits_processor = new LogitsProcessorList()
    logits_processor.push(probe)
    await this.model.generate({
      inputs: input_features,
      decoder_input_ids: [this.config.decoder_start_token_id],
      max_new_tokens: 1,
      logits_processor,
    } as Parameters<WhisperForConditionalGeneration['generate']>[0])

    const logits = probe.logits
    if (!logits) return 'en'
    let best: WhisperLanguage = 'en'
    let bestLogit = -Infinity
    for (const lang of LANGUAGES) {
      const id = this.config.lang_to_id[`<|${lang}|>`]
      const value = id === undefined ? -Infinity : logits[id]!
      if (value > bestLogit) {
        bestLogit = value
        best = lang
      }
    }
    return best
  }
}

function round(x: number): number {
  return Math.round(x * 100) / 100
}
