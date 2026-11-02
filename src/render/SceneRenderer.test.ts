import { describe, expect, it } from 'vitest'
import type { RenderCanvas } from '@/shared'
import { createFakeTimeline } from './dev/fakeTimeline'
import { SceneRenderer } from './SceneRenderer'
import { createRecordingCanvas } from './testing/recordingCanvas'

const timeline = createFakeTimeline({ durationSec: 8 })

async function setup(width = 1080, height = 1920) {
  const { canvas, log } = createRecordingCanvas()
  const renderer = new SceneRenderer()
  await renderer.init({
    canvas: canvas as unknown as RenderCanvas,
    width,
    height,
    fps: 30,
    timeline,
    scene: null,
  })
  // Warm-up: the first frame also measures text (cached layout), which adds context calls.
  renderer.renderFrame(0)
  const render = (frame: number) => {
    log.length = 0
    renderer.renderFrame(frame)
    return structuredClone(log)
  }
  return { canvas, renderer, render }
}

describe('SceneRenderer', () => {
  it('issues identical drawing commands for the same frame', async () => {
    const { render } = await setup()
    const a = render(100)
    render(37)
    render(180)
    expect(render(100)).toEqual(a)
  })

  it('gives the same frame in a fresh renderer (no state carried between frames)', async () => {
    const one = await setup()
    one.render(5)
    one.render(99)
    const two = await setup()
    expect(two.render(99)).toEqual(one.render(99))
  })

  it('draws different frames differently', async () => {
    const { render } = await setup()
    expect(render(10)).not.toEqual(render(20))
  })

  it.each([
    [1080, 1920],
    [1920, 1080],
    [1080, 1080],
  ])('renders %ix%i without changing the scene', async (w, h) => {
    const { canvas, render } = await setup(w, h)
    expect([canvas.width, canvas.height]).toEqual([w, h])
    const log = render(60)
    expect(log.some((c) => c[0] === 'fillText')).toBe(true)
    expect(log.some((c) => c[0] === 'roundRect')).toBe(true)
  })

  it('resizes the canvas', async () => {
    const { canvas, renderer } = await setup()
    renderer.resize(720, 1280)
    expect([canvas.width, canvas.height]).toEqual([720, 1280])
  })

  it('wraps every layer in save/restore and resets state each frame', async () => {
    const { render } = await setup()
    const log = render(0)
    expect(log[0]).toEqual(['setTransform', 1, 0, 0, 1, 0, 0])
    const saves = log.filter((c) => c[0] === 'save').length
    expect(saves).toBe(3)
    expect(log.filter((c) => c[0] === 'restore').length).toBe(saves)
  })

  it('throws when used before init', () => {
    expect(() => new SceneRenderer().renderFrame(0)).toThrow()
  })
})
