/**
 * Which files a model configuration downloads, and how big they are — for the
 * "Download N MB once?" prompt. Sizes come from models.json for mirrored models.
 */
import { resolveModel } from './resolve'
import { mirroredModel } from './manifest'
import {
  WHISPER_MODELS,
  type WhisperDtype,
  type WhisperModelId,
  type WhisperDtypes,
} from './whisper/variants'

const DTYPE_SUFFIX: Record<WhisperDtype, string> = {
  fp32: '',
  fp16: '_fp16',
  q8: '_quantized',
  q4: '_q4',
  q4f16: '_q4f16',
}

const CONFIG_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
]

/**
 * Sizes of upstream files for models without a mirror yet (bytes, from the pinned upstream revision).
 * Only the variants the app can select are listed.
 */
const UPSTREAM_SIZES: Partial<Record<WhisperModelId, Record<string, number>>> = {
  'whisper-large-v3-turbo-timestamped': {
    'config.json': 2_300,
    'generation_config.json': 4_000,
    'preprocessor_config.json': 400,
    'tokenizer.json': 2_480_000,
    'tokenizer_config.json': 283_000,
    'onnx/encoder_model_q4f16.onnx': 370_000_000,
    'onnx/decoder_model_merged_q4f16.onnx': 193_600_000,
  },
}

export interface ModelFile {
  path: string
  url: string
  size: number
}

export function modelFiles(model: WhisperModelId, dtype: WhisperDtypes): ModelFile[] {
  const { repo, revision } = resolveModel(WHISPER_MODELS[model])
  const paths = [
    ...CONFIG_FILES,
    `onnx/encoder_model${DTYPE_SUFFIX[dtype.encoder_model]}.onnx`,
    `onnx/decoder_model_merged${DTYPE_SUFFIX[dtype.decoder_model_merged]}.onnx`,
  ]
  const mirrored = mirroredModel(model)
  const sizes = new Map<string, number>(
    mirrored
      ? mirrored.files.map((f) => [f.path, f.size])
      : Object.entries(UPSTREAM_SIZES[model] ?? {}),
  )
  return paths.map((path) => ({
    path,
    url: `https://huggingface.co/${repo}/resolve/${revision}/${path}`,
    size: sizes.get(path) ?? 0,
  }))
}
