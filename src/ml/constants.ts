/** Sample rate Whisper expects. */
export const SAMPLE_RATE = 16000

/**
 * Cache API bucket for model files. Set as transformers.js `env.cacheKey` in the worker; main-thread
 * code uses this constant so it does not have to import transformers.js.
 */
export const MODEL_CACHE_KEY = 'transformers-cache'
