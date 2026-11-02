import { analyzeAudio, type DecodedAudio } from '@/audio'
import { TIMELINE_SCHEMA_VERSION, type Lyrics, type Timeline } from '@/shared'

export type AnalysisPhase = 'decoding' | 'analyzing'

/** Decoded PCM of each analyzed timeline, kept for export (muxing the original audio). */
const pcmByTimeline = new WeakMap<Timeline, DecodedAudio>()

export function pcmFor(timeline: Timeline): DecodedAudio | undefined {
  return pcmByTimeline.get(timeline)
}

/** New timeline with other lyrics; keeps the PCM link so export still has the audio. */
export function withLyrics(timeline: Timeline, lyrics: Lyrics | null): Timeline {
  const next: Timeline = { ...timeline, lyrics }
  const pcm = pcmByTimeline.get(timeline)
  if (pcm) pcmByTimeline.set(next, pcm)
  return next
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
