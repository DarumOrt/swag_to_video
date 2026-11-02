import { describe, expect, it } from 'vitest'
import {
  EMBEDDED_FONTS,
  embeddedFamiliesIn,
  FONT_FAMILY,
  fontStack,
  loadEmbeddedFonts,
} from './fonts'

describe('embedded fonts', () => {
  it('ship latin and cyrillic subsets for every family', () => {
    for (const f of EMBEDDED_FONTS) {
      expect(f.files.map((x) => x.url).join()).toMatch(/latin.*cyrillic/)
      expect(f.files.find((x) => x.url.includes('cyrillic'))?.unicodeRange).toContain('U+0400-045F')
    }
  })

  it('finds embedded families in CSS font-family lists', () => {
    expect(embeddedFamiliesIn([fontStack(FONT_FAMILY.display), 'Arial, sans-serif'])).toEqual([
      FONT_FAMILY.display,
    ])
  })

  it('loads as a no-op without FontFace (Node, the module never touches window/document)', async () => {
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
    await expect(loadEmbeddedFonts()).resolves.toBeUndefined()
  })
})
