/**
 * Seams between the app shell and the feature modules. Everything here is a stub with the
 * shapes from `@/shared`; the main session replaces the implementations with `@/audio`,
 * `@/render` and `@/export` without touching the components.
 */
import type { FrameRenderer } from '@/shared'
import { t } from '../i18n'
import { StubRenderer } from './renderer.stub'

export { analyzeTrackStub as analyzeTrack, type AnalysisPhase } from './analysis.stub'
export { exportVideoStub as exportVideo, type ExportJob } from './exporter.stub'

export function createRenderer(): FrameRenderer {
  return new StubRenderer(t.preview.stub)
}
