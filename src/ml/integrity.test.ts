import { describe, expect, it } from 'vitest'
import { IntegrityError, sha256Hex, verifyingFetch } from './integrity'

const bytes = new TextEncoder().encode('model weights')
const url = 'https://huggingface.co/x/y/resolve/abc/onnx/model.onnx'

describe('verifyingFetch', async () => {
  const good = await sha256Hex([bytes])
  const files = (sha256: string) =>
    new Map([[url, { path: 'onnx/model.onnx', size: bytes.length, sha256, url }]])
  const fetchBytes = async () =>
    new Response(bytes, { headers: { 'content-length': String(bytes.length) } })

  it('passes a matching body through unchanged, keeping headers', async () => {
    const response = await verifyingFetch(fetchBytes, files(good))(url)
    expect(response.headers.get('content-length')).toBe(String(bytes.length))
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })

  it('errors the body on a hash mismatch', async () => {
    const response = await verifyingFetch(fetchBytes, files('0'.repeat(64)))(url)
    await expect(response.arrayBuffer()).rejects.toBeInstanceOf(IntegrityError)
  })

  it('leaves URLs outside the manifest alone', async () => {
    const response = await verifyingFetch(
      fetchBytes,
      files('0'.repeat(64)),
    )('https://example.com/other')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  })
})
