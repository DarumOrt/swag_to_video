import { SpectrumBarsLayer } from '@/visualizers'
import { BackgroundLayer } from './layers/background'
import { TextLayer } from './layers/text'
import type { LayerSpec } from './scene'
import type { Layer } from './types'

export function createLayer(spec: LayerSpec): Layer {
  switch (spec.type) {
    case 'background':
      return new BackgroundLayer(spec)
    case 'spectrum-bars':
      return new SpectrumBarsLayer(spec)
    case 'text':
      return new TextLayer(spec)
  }
}
