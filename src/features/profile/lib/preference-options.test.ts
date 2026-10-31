import { describe, expect, it } from 'vitest'
import {
  CURRENCY_OPTIONS,
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  ONBOARDING_LANGUAGE_OPTIONS,
  TIME_FORMAT_OPTIONS,
} from './preference-options'
import {
  currencySchema,
  dateFormatSchema,
  localeSchema,
  timeFormatSchema,
} from '@/validators/profile'

describe('canonical profile options', () => {
  it('derives every closed-choice option from the validation schema', () => {
    for (const [options, schema] of [
      [CURRENCY_OPTIONS, currencySchema],
      [DATE_FORMAT_OPTIONS, dateFormatSchema],
      [TIME_FORMAT_OPTIONS, timeFormatSchema],
      [LANGUAGE_OPTIONS, localeSchema],
    ] as const) {
      expect(options.map(({ value }) => value)).toEqual(schema.options)
      expect(options.every(({ label }) => label.length > 0)).toBe(true)
    }
  })

  it('preserves onboarding labels and its existing subset without a second definition', () => {
    expect(ONBOARDING_LANGUAGE_OPTIONS.map(({ value }) => value)).toEqual([
      'en',
      'hi',
    ])
    for (const option of ONBOARDING_LANGUAGE_OPTIONS)
      expect(LANGUAGE_OPTIONS).toContain(option)
  })
})
