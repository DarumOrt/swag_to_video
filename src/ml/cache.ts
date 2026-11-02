/**
 * Browser-side model cache management. transformers.js stores every fetched file in the Cache API
 * under `env.cacheKey`, keyed by URL (which contains the repo id and revision).
 */
import { env } from '@huggingface/transformers'

export interface CachedRepo {
  repo: string
  files: number
  bytes: number
}

const HF_URL = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//

export async function listCachedModels(): Promise<CachedRepo[]> {
  if (!('caches' in globalThis)) return []
  const cache = await caches.open(env.cacheKey)
  const byRepo = new Map<string, CachedRepo>()
  for (const request of await cache.keys()) {
    const repo = HF_URL.exec(request.url)?.[1]
    if (!repo) continue
    const entry = byRepo.get(repo) ?? { repo, files: 0, bytes: 0 }
    const response = await cache.match(request)
    entry.files++
    entry.bytes += Number(response?.headers.get('content-length') ?? 0)
    byRepo.set(repo, entry)
  }
  return [...byRepo.values()]
}

/** Removes all cached files of one repo (any revision). */
export async function deleteCachedModel(repo: string): Promise<number> {
  const cache = await caches.open(env.cacheKey)
  let removed = 0
  for (const request of await cache.keys()) {
    if (HF_URL.exec(request.url)?.[1] === repo && (await cache.delete(request))) removed++
  }
  return removed
}

/** Asks the browser not to evict our storage under pressure. Returns whether it is persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  return (await navigator.storage.persisted()) || navigator.storage.persist()
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  const estimate = await navigator.storage?.estimate?.()
  return estimate ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 } : null
}
