import { describe, expect, it } from 'vitest'
import { cn, getSimilarityScore, numberToIndianWords } from './utils'

describe('class names', () => {
  it('merges conditional classes and resolves conflicting Tailwind utilities', () => {
    expect(cn('p-2', false, { 'text-sm': true }, ['p-4'])).toBe('text-sm p-4')
  })
})

describe('Indian amount words', () => {
  it.each([
    [0, 'Zero Rupees Only'],
    [-10, 'Zero Rupees Only'],
    [NaN, 'Zero Rupees Only'],
    [Infinity, 'Zero Rupees Only'],
    [19, 'Nineteen Rupees Only'],
    [20, 'Twenty Rupees Only'],
    [21, 'Twenty One Rupees Only'],
    [100, 'One Hundred Rupees Only'],
    [105, 'One Hundred and Five Rupees Only'],
    [999, 'Nine Hundred and Ninety Nine Rupees Only'],
    [1000, 'One Thousand Rupees Only'],
    [100000, 'One Lakh Rupees Only'],
    [10000000, 'One Crore Rupees Only'],
    [10000000000, 'One Thousand Crore Rupees Only'],
    [10010000000, 'One Thousand One Crore Rupees Only'],
    [
      999999999999.99,
      'Ninety Nine Thousand Nine Hundred and Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred and Ninety Nine Rupees Only',
    ],
    [
      12345678,
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred and Seventy Eight Rupees Only',
    ],
    [42.99, 'Forty Two Rupees Only'],
  ])('formats %s as %s', (amount, expected) => {
    expect(numberToIndianWords(amount)).toBe(expected)
  })

  it.each([
    ['$', 'Dollars'],
    ['€', 'Euros'],
    ['£', 'Pounds'],
    ['unknown', 'Rupees'],
  ])('uses the currency name for %s', (currency, name) => {
    expect(numberToIndianWords(1, currency)).toBe(`One ${name} Only`)
    expect(numberToIndianWords(0, currency)).toBe(`Zero ${name} Only`)
  })
})

describe('similarity score', () => {
  it('normalizes case and outer whitespace', () => {
    expect(getSimilarityScore('  BANK ', 'bank')).toBe(1)
    expect(getSimilarityScore('', '')).toBe(1)
  })

  it('returns zero for one missing or wholly different value', () => {
    expect(getSimilarityScore('bank', '')).toBe(0)
    expect(getSimilarityScore('', 'bank')).toBe(0)
    expect(getSimilarityScore('abc', 'xyz')).toBe(0)
  })

  it.each([
    ['kitten', 'sitting', 4 / 7],
    ['bank', 'banks', 4 / 5],
    ['bank', 'bark', 3 / 4],
  ])(
    'normalizes edit distance between %s and %s',
    (first, second, expected) => {
      expect(getSimilarityScore(first, second)).toBeCloseTo(expected)
      expect(getSimilarityScore(second, first)).toBeCloseTo(expected)
    },
  )
})
