/**
 * SHA-256 verification of model files listed in models.json.
 *
 * Wraps `fetch` so the body of every manifest URL streams through unchanged while being hashed
 * incrementally (hash-wasm) — no extra copy of the file is held. At the end of the stream the digest
 * and size are compared and a mismatch errors the stream. transformers.js reads the body before writing
 * it to the Cache API, so a corrupted or swapped file never gets cached.
 * Cache hits are not re-hashed: a file is verified once, when it is downloaded.
 */
import { createSHA256 } from 'hash-wasm'
import { manifest, type ManifestFile } from './manifest'

export class IntegrityError extends Error {
  constructor(url: string, detail: string) {
    super(`Integrity check failed for ${url}: ${detail}`)
    this.name = 'IntegrityError'
  }
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>
type Expected = Pick<ManifestFile, 'sha256' | 'size'>

function manifestFiles(): Map<string, Expected> {
  const files = new Map<string, Expected>()
  for (const model of Object.values(manifest.models)) {
    for (const file of model.files) if (file.url) files.set(file.url, file)
  }
  return files
}

/** Returns a response whose body fails at the end if its size or SHA-256 differs from `expected`. */
export function verifyResponse(response: Response, url: string, expected: Expected): Response {
  if (!response.ok || !response.body) return response
  const hasher = createSHA256()
  let size = 0
  const check = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      ;(await hasher).update(chunk)
      size += chunk.byteLength
      controller.enqueue(chunk)
    },
    async flush(controller) {
      const actual = (await hasher).digest('hex')
      if (size !== expected.size) {
        controller.error(new IntegrityError(url, `size ${size}, expected ${expected.size}`))
      } else if (actual !== expected.sha256) {
        controller.error(new IntegrityError(url, `sha256 ${actual}, expected ${expected.sha256}`))
      }
    },
  })
  return new Response(response.body.pipeThrough(check), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** Wraps a fetch so that every file listed in models.json is size- and SHA-256-verified. */
export function verifyingFetch(base: Fetch, files = manifestFiles()): Fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.href
    const response = await base(input, init)
    const expected = files.get(url)
    return expected ? verifyResponse(response, url, expected) : response
  }
}
