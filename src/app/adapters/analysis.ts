import { analyzeAudio, type DecodedAudio } from '@/audio'
import { TIMELINE_SCHEMA_VERSION, type Timeline } from '@/shared'

export type AnalysisPhase = 'decoding' | 'analyzing'

/** Decoded PCM of each analyzed timeline, kept for export (muxing the original audio). */
const pcmByTimeline = new WeakMap<Timeline, DecodedAudio>()

export function pcmFor(timeline: Timeline): DecodedAudio | undefined {
  return pcmByTimeline.get(timeline)
}

export async function analyzeTrack(
  file: File,
  onPhase: (phase: AnalysisPhase) => void,
): Promise<Timeline> {
  const { analysis, pcm } = await analyzeAudio(file, {
    onProgress: ({ stage }) => onPhase(stage === 'decode' ? 'decoding' : 'analyzing'),
  })
  const timeline: Timeline = {
    version: TIMELINE_SCHEMA_VERSION,
    audio: analysis,
    lyrics: null,
    accents: [],
  }
  pcmByTimeline.set(timeline, pcm)
  return timeline
}
