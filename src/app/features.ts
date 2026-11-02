export interface BrowserFeatures {
  webCodecs: boolean
  webGpu: boolean
  crossOriginIsolated: boolean
}

export function detectFeatures(): BrowserFeatures {
  return {
    webCodecs: typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined',
    webGpu: typeof navigator !== 'undefined' && 'gpu' in navigator,
    crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated,
  }
}
