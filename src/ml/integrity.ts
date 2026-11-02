/**
 * SHA-256 verification of model files listed in models.json.
 *
 * Wraps `fetch` so the body of every manifest URL streams through unchanged while being collected;
 * at the end of the stream the digest is compared and a mismatch errors the stream. transformers.js
 * reads the body before writing it to the Cache API, so a corrupted or swapped file never gets cached.
 * Cache hits are not re-hashed: a file is verified once, when it is downloaded.
 */
import { manifest, type ManifestFile } from './manifest'

export class IntegrityError extends Error {
  constructor(url: string, expected: string, actual: string) {
    super(`SHA-256 mismatch for ${url}: expected ${expected}, got ${actual}`)
    this.name = 'IntegrityError'
  }
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

function manifestFiles(): Map<string, ManifestFile> {
  const files = new Map<string, ManifestFile>()
  for (const model of Object.values(manifest.models)) {
    for (const file of model.files) if (file.url) files.set(file.url, file)
  }
  return files
}

export async function sha256Hex(chunks: Uint8Array[]): Promise<string> {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0)
  const data = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Returns a response whose body fails at the end if its SHA-256 differs from `expected`. */
export function verifyResponse(response: Response, url: string, expected: string): Response {
  if (!response.ok || !response.body) return response
  const chunks: Uint8Array[] = []
  const check = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      chunks.push(chunk)
      controller.enqueue(chunk)
    },
    async flush(controller) {
      const actual = await sha256Hex(chunks)
      chunks.length = 0
      if (actual !== expected) controller.error(new IntegrityError(url, expected, actual))
    },
  })
  return new Response(response.body.pipeThrough(check), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** Wraps a fetch so that every file listed in models.json is SHA-256-verified. */
export function verifyingFetch(base: Fetch, files = manifestFiles()): Fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input.href
    const response = await base(input, init)
    const expected = files.get(url)
    return expected ? verifyResponse(response, url, expected.sha256) : response
  }
}
