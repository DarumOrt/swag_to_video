/**
 * Browser-side model cache management. transformers.js stores every fetched file in the Cache API
 * under `MODEL_CACHE_KEY`, keyed by URL (which contains the repo id and revision).
 */
import { MODEL_CACHE_KEY } from './constants'

export interface CachedRepo {
  repo: string
  files: number
  bytes: number
}

const HF_URL = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//

export async function listCachedModels(): Promise<CachedRepo[]> {
  if (!('caches' in globalThis)) return []
  const cache = await caches.open(MODEL_CACHE_KEY)
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
  const cache = await caches.open(MODEL_CACHE_KEY)
  let removed = 0
  for (const request of await cache.keys()) {
    if (HF_URL.exec(request.url)?.[1] === repo && (await cache.delete(request))) removed++
  }
  return removed
}

/** Removes every cached model file (all repos, all revisions). Returns the number of files removed. */
export async function deleteCachedModels(): Promise<number> {
  if (!('caches' in globalThis)) return 0
  const cache = await caches.open(MODEL_CACHE_KEY)
  let removed = 0
  for (const request of await cache.keys()) {
    if (HF_URL.test(request.url) && (await cache.delete(request))) removed++
  }
  return removed
}

/** Which of these URLs are already in the model cache. */
export async function cachedUrls(urls: readonly string[]): Promise<Set<string>> {
  if (!('caches' in globalThis)) return new Set()
  const cache = await caches.open(MODEL_CACHE_KEY)
  const hits = await Promise.all(urls.map(async (url) => ((await cache.match(url)) ? url : null)))
  return new Set(hits.filter((u): u is string => u !== null))
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
