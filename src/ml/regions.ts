/**
 * Turns the audio module's vocal-activity ranges into regions worth sending to Whisper.
 * Whisper hallucinates on instrumentals, so skipping them is mainly a safety measure; the detector is
 * coarse, so we pad generously and fall back to the whole track when the result looks implausible.
 */
export interface TimeRange {
  start: number
  end: number
}

export interface RegionOptions {
  /** Added before and after each range (vocals often start on a soft consonant). */
  padSec: number
  /** Ranges closer than this are merged (keeps lines in one Whisper window). */
  mergeGapSec: number
  /** Below this share of the track, the detector probably failed — transcribe everything. */
  minCoverage: number
}

export const DEFAULT_REGION_OPTIONS: RegionOptions = {
  padSec: 1,
  mergeGapSec: 3,
  minCoverage: 0.15,
}

/** Returns undefined for "transcribe the whole track". */
export function vocalRegions(
  ranges: readonly TimeRange[] | undefined,
  durationSec: number,
  options: RegionOptions = DEFAULT_REGION_OPTIONS,
): TimeRange[] | undefined {
  if (!ranges?.length || durationSec <= 0) return undefined
  const padded = ranges
    .map((r) => ({
      start: Math.max(0, r.start - options.padSec),
      end: Math.min(durationSec, r.end + options.padSec),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start)

  const merged: TimeRange[] = []
  for (const r of padded) {
    const last = merged.at(-1)
    if (last && r.start - last.end <= options.mergeGapSec) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }

  const covered = merged.reduce((s, r) => s + (r.end - r.start), 0)
  if (covered / durationSec < options.minCoverage) return undefined
  return merged
}
