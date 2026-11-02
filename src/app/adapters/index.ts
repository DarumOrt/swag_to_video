/**
 * Seams between the app shell and the feature modules (`@/audio`, `@/render`, `@/export`).
 * Components import from here only, so module APIs can change without touching them.
 */
import { SceneRenderer } from '@/render'
import type { FrameRenderer } from '@/shared'

export { analyzeTrack, type AnalysisPhase } from './analysis'
export { exportVideo, type ExportedFile, type ExportJob } from './exporter'

export function createRenderer(): FrameRenderer {
  return new SceneRenderer()
}
