import { describe, expect, it } from 'vitest'
import { chooseConfig, type DeviceProfile } from './device'
import { modelFiles } from './files'
import { manifest } from './manifest'
import { vocalRegions } from './regions'

const gpu: DeviceProfile = { webgpu: true, f16: true, memoryGb: 8, adapter: null }

describe('chooseConfig', () => {
  it('uses the light WebGPU variant when WebGPU with fp16 is available', () => {
    expect(chooseConfig(gpu, 'light')).toMatchObject({
      model: 'whisper-small-timestamped',
      device: 'webgpu',
      dtype: { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      note: null,
    })
  })

  it('falls back to WASM q8 without WebGPU, without fp16 or with little memory', () => {
    for (const profile of [
      { ...gpu, webgpu: false },
      { ...gpu, f16: false },
      { ...gpu, memoryGb: 2 },
    ]) {
      expect(chooseConfig(profile, 'light')).toMatchObject({
        device: 'wasm',
        dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
      })
    }
  })

  it('gives turbo only for "max" on capable devices, always with a note', () => {
    const max = chooseConfig(gpu, 'max')
    expect(max.model).toBe('whisper-large-v3-turbo-timestamped')
    expect(max.note).toBeTruthy()

    const weak = chooseConfig({ ...gpu, memoryGb: 4 }, 'max')
    expect(weak.model).toBe('whisper-small-timestamped')
    expect(weak.note).toMatch(/недоступен/)
  })
})

describe('modelFiles', () => {
  it('lists config files plus the encoder/decoder of the chosen dtype, with manifest sizes', () => {
    const files = modelFiles('whisper-small-timestamped', {
      encoder_model: 'fp16',
      decoder_model_merged: 'q4f16',
    })
    expect(files.map((f) => f.path)).toEqual([
      'config.json',
      'generation_config.json',
      'preprocessor_config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/encoder_model_fp16.onnx',
      'onnx/decoder_model_merged_q4f16.onnx',
    ])
    const entry = manifest.models['whisper-small-timestamped']
    if (entry?.revision) {
      // Every file the light configs need must be in the mirror, with its size and pinned URL.
      for (const f of files) {
        const listed = entry.files.find((m) => m.path === f.path)
        expect(listed, f.path).toBeDefined()
        expect(f.size).toBe(listed!.size)
        expect(f.url).toBe(listed!.url)
      }
    }
  })

  it('every selectable small config is mirrored', () => {
    const entry = manifest.models['whisper-small-timestamped']
    if (!entry?.revision) return
    const paths = new Set(entry.files.map((f) => f.path))
    for (const dtype of [
      { encoder_model: 'fp16', decoder_model_merged: 'q4f16' },
      { encoder_model: 'q8', decoder_model_merged: 'q8' },
    ] as const) {
      for (const f of modelFiles('whisper-small-timestamped', dtype))
        expect(paths.has(f.path), f.path).toBe(true)
    }
  })
})

describe('vocalRegions', () => {
  it('pads, merges close ranges and clamps to the track', () => {
    expect(
      vocalRegions(
        [
          { start: 10, end: 20 },
          { start: 21, end: 40 },
          { start: 80, end: 99.5 },
        ],
        100,
      ),
    ).toEqual([
      { start: 9, end: 41 },
      { start: 79, end: 100 },
    ])
  })

  it('returns undefined (whole track) when nothing or too little was detected', () => {
    expect(vocalRegions(undefined, 100)).toBeUndefined()
    expect(vocalRegions([], 100)).toBeUndefined()
    expect(vocalRegions([{ start: 50, end: 52 }], 100)).toBeUndefined()
  })
})
