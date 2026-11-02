import { describe, expect, it } from 'vitest'
import { phoneticKey, transliterate, wordSimilarity } from './similarity'
import {
  countSyllables,
  detectLanguage,
  normalizeWord,
  parseSectionLabel,
  tokenizeLine,
} from './text'

describe('tokenizeLine', () => {
  it('keeps punctuation on words and glues standalone symbols to neighbours', () => {
    expect(tokenizeLine('Эй, ты — слышишь? 🔥')).toEqual(['Эй,', 'ты —', 'слышишь? 🔥'])
    expect(tokenizeLine('— а я иду')).toEqual(['— а', 'я', 'иду'])
  })

  it('keeps hyphens, apostrophes and numbers inside words', () => {
    expect(tokenizeLine("Don't stop,  по-моему  2024")).toEqual([
      "Don't",
      'stop,',
      'по-моему',
      '2024',
    ])
    expect(tokenizeLine('rock-n-roll (yeah)')).toEqual(['rock-n-roll', '(yeah)'])
  })

  it('returns nothing for lines without singable content', () => {
    expect(tokenizeLine('♪ ♪ ...')).toEqual([])
    expect(tokenizeLine('   ')).toEqual([])
  })
})

describe('normalizeWord', () => {
  it('folds case, ё, stress marks and punctuation', () => {
    expect(normalizeWord('Ёлка!')).toBe('елка')
    expect(normalizeWord("Don't")).toBe('dont')
    expect(normalizeWord('Don’t')).toBe('dont')
    expect(normalizeWord('По-моему,')).toBe('помоему')
    expect(normalizeWord('соба́ка')).toBe('собака')
    expect(normalizeWord('Йод')).toBe('йод')
    expect(normalizeWord('—')).toBe('')
  })
})

describe('countSyllables', () => {
  it('counts Russian vowels', () => {
    expect(countSyllables('молоко')).toBe(3)
    expect(countSyllables('Звезда,')).toBe(2)
    expect(countSyllables('в')).toBe(0)
  })

  it('estimates English syllables', () => {
    expect(countSyllables('time')).toBe(1)
    expect(countSyllables('fire')).toBe(1)
    expect(countSyllables('hello')).toBe(2)
    expect(countSyllables('city')).toBe(2)
  })

  it('gives digits weight', () => {
    expect(countSyllables('2024')).toBe(6)
  })
})

describe('detectLanguage', () => {
  it('detects ru / en / mixed', () => {
    expect(detectLanguage('Ночной трамвай везёт меня домой')).toBe('ru')
    expect(detectLanguage('Neon lights are falling on the street')).toBe('en')
    expect(detectLanguage('Hey бэйби, я на drive, мы летим в the night')).toBe('mixed')
  })
})

describe('parseSectionLabel', () => {
  it('recognizes headers', () => {
    expect(parseSectionLabel('[Припев]')).toBe('Припев')
    expect(parseSectionLabel('[Verse 2: MC Test]')).toBe('Verse 2: MC Test')
    expect(parseSectionLabel('Куплет 1:')).toBe('Куплет 1')
    expect(parseSectionLabel('(Chorus x2)')).toBe('Chorus x2')
  })

  it('does not treat lyrics as headers', () => {
    expect(parseSectionLabel('Припев: я иду домой')).toBeNull()
    expect(parseSectionLabel('(эй, эй)')).toBeNull()
    expect(parseSectionLabel('Intro')).toBeNull()
  })
})

describe('similarity', () => {
  it('transliterates Cyrillic', () => {
    expect(transliterate('щука ёж')).toBe('schuka yozh')
    expect(phoneticKey('хей')).toBe(phoneticKey('hey'))
  })

  it('matches across scripts', () => {
    expect(wordSimilarity('Хей', 'hey')).toBe(100)
    expect(wordSimilarity('бэйби', 'baby')).toBeGreaterThanOrEqual(55)
    expect(wordSimilarity('драйв', 'drive')).toBeGreaterThanOrEqual(55)
  })

  it('scores near-misses high and different words low', () => {
    expect(wordSimilarity('Везёт', 'везет')).toBe(100)
    expect(wordSimilarity('привет', 'привед')).toBeGreaterThan(80)
    expect(wordSimilarity('дом', 'кот')).toBeLessThan(55)
    expect(wordSimilarity('я', 'и')).toBe(0)
  })
})
