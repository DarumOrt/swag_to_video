/**
 * Where a model's weights come from. Each model has an upstream repo (onnx-community, pinned by commit)
 * and our mirror (DarumOrt/*, pinned in models.json). The mirror is used as soon as models.json has a
 * revision for the model; until then — or with PREFER_UPSTREAM — weights load from upstream.
 */
import { mirroredModel } from './manifest'

/** Force upstream repos even when a mirror exists (debugging only). */
const PREFER_UPSTREAM = false

export interface ModelSource {
  id: string
  upstream: string
  upstreamRevision: string
}

export interface ResolvedModel {
  repo: string
  revision: string
  mirrored: boolean
}

export function resolveModel(source: ModelSource): ResolvedModel {
  const mirror = PREFER_UPSTREAM ? null : mirroredModel(source.id)
  return mirror
    ? { repo: mirror.repo, revision: mirror.revision, mirrored: true }
    : { repo: source.upstream, revision: source.upstreamRevision, mirrored: false }
}
