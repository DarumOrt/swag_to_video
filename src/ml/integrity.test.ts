import { sha256 } from 'hash-wasm'
import { describe, expect, it } from 'vitest'
import { IntegrityError, verifyingFetch } from './integrity'

const bytes = new TextEncoder().encode('model weights '.repeat(1000))
const url = 'https://huggingface.co/x/y/resolve/abc/onnx/model.onnx'

/** Serves `bytes` in small chunks, like a network response. */
async function fetchBytes() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 1000) controller.enqueue(bytes.slice(i, i + 1000))
      controller.close()
    },
  })
  return new Response(stream, { headers: { 'content-length': String(bytes.length) } })
}

describe('verifyingFetch', async () => {
  const good = await sha256(bytes)
  const files = (hash: string, size = bytes.length) => new Map([[url, { sha256: hash, size }]])

  it('passes a matching body through unchanged, keeping headers', async () => {
    const response = await verifyingFetch(fetchBytes, files(good))(url)
    expect(response.headers.get('content-length')).toBe(String(bytes.length))
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('errors the body on a hash mismatch', async () => {
    const response = await verifyingFetch(fetchBytes, files('0'.repeat(64)))(url)
    await expect(response.arrayBuffer()).rejects.toBeInstanceOf(IntegrityError)
  })

  it('errors the body on a size mismatch', async () => {
    const response = await verifyingFetch(fetchBytes, files(good, bytes.length + 1))(url)
    await expect(response.arrayBuffer()).rejects.toBeInstanceOf(IntegrityError)
  })

  it('leaves URLs outside the manifest alone', async () => {
    const response = await verifyingFetch(
      fetchBytes,
      files('0'.repeat(64)),
    )('https://example.com/x')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })
})
