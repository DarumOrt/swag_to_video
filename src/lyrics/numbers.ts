/**
 * Numbers spelled out for matching: the recognizer writes "2" where the lyrics say "два" / "two"
 * (or the other way round). Covers 0–999 in Russian and English, base (nominative) forms only.
 */

const RU_UNITS = [
  'ноль',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]
const RU_TEENS = [
  'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
  'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать',
] // prettier-ignore
const RU_TENS = [
  '', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто',
] // prettier-ignore
const RU_HUNDREDS = [
  '', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот',
] // prettier-ignore

const EN_UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const EN_TEENS = [
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
] // prettier-ignore
const EN_TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
]

export type NumberLanguage = 'ru' | 'en'

/** Largest number `spellNumber` handles. */
export const MAX_SPELLED_NUMBER = 999

/** Words for an integer 0..999 ("21" → ["двадцать", "один"] / ["twenty", "one"]), else null. */
export function spellNumber(value: number, language: NumberLanguage): string[] | null {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SPELLED_NUMBER) return null
  const ru = language === 'ru'
  const units = ru ? RU_UNITS : EN_UNITS
  if (value === 0) return [units[0]!]

  const words: string[] = []
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  if (hundreds) {
    if (ru) words.push(RU_HUNDREDS[hundreds]!)
    else words.push(EN_UNITS[hundreds]!, 'hundred')
  }
  if (rest >= 10 && rest < 20) {
    words.push((ru ? RU_TEENS : EN_TEENS)[rest - 10]!)
  } else {
    const tens = Math.floor(rest / 10)
    const one = rest % 10
    if (tens) words.push((ru ? RU_TENS : EN_TENS)[tens]!)
    if (one) words.push(units[one]!)
  }
  return words
}
