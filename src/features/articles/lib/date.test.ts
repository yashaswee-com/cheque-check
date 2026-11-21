import { describe, expect, it } from 'vitest'
import { articleDateParts, ordinalSuffix } from './date'

describe('article dates', () => {
  it.each([
    [1, 'st'],
    [2, 'nd'],
    [3, 'rd'],
    [4, 'th'],
    [11, 'th'],
    [12, 'th'],
    [13, 'th'],
    [21, 'st'],
    [22, 'nd'],
    [23, 'rd'],
  ])('formats the ordinal suffix for %s', (day, suffix) => {
    expect(ordinalSuffix(day)).toBe(suffix)
  })

  it('returns stable UTC date parts for superscript rendering', () => {
    expect(articleDateParts('2026-11-21')).toEqual({
      day: 21,
      suffix: 'st',
      month: 'November',
      year: 2026,
    })
  })
})
