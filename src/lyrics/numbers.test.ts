import { describe, expect, it } from 'vitest'
import { spellNumber } from './numbers'

describe('spellNumber', () => {
  it('spells 0–999 in Russian and English', () => {
    expect(spellNumber(2, 'ru')).toEqual(['два'])
    expect(spellNumber(15, 'en')).toEqual(['fifteen'])
    expect(spellNumber(21, 'ru')).toEqual(['двадцать', 'один'])
    expect(spellNumber(340, 'en')).toEqual(['three', 'hundred', 'forty'])
    expect(spellNumber(0, 'ru')).toEqual(['ноль'])
    expect(spellNumber(1000, 'en')).toBeNull()
  })
})

describe('matchUnits', () => {
  it('splits hyphens and spells numbers', async () => {
    const { matchUnits } = await import('./align')
    expect(matchUnits('по-моему,', 'ru')).toEqual(['по', 'моему,'])
    expect(matchUnits('21', 'ru')).toEqual(['двадцать', 'один'])
    expect(matchUnits('2024', 'en')).toEqual(['2024'])
    expect(matchUnits('rock-n-roll', 'en')).toEqual(['rock', 'n', 'roll'])
  })
})
