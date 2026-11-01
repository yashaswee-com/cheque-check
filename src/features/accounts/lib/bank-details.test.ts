import { describe, expect, it } from 'vitest'
import {
  BANK_TYPES,
  bankSearchLabel,
  isValidBankAbbreviation,
  normalizeBankAbbreviation,
} from './bank-details'
import {
  countryName,
  countryOptions,
  DEFAULT_COUNTRY_CODE,
} from '@/lib/countries'

describe('bank details', () => {
  it('offers every institution type except custom, including payments banks', () => {
    expect(BANK_TYPES).toContain('payments')
    expect(BANK_TYPES).not.toContain('custom')
    expect(new Set(BANK_TYPES).size).toBe(BANK_TYPES.length)
  })

  it('normalises abbreviations to trimmed upper case with single spaces', () => {
    expect(normalizeBankAbbreviation('  sbi ')).toBe('SBI')
    expect(normalizeBankAbbreviation('a   b')).toBe('A B')
  })

  it('accepts empty or 2-10 character abbreviations containing a letter', () => {
    for (const valid of ['', 'SB', 'HDFC', 'J&K', 'P.N.B', 'abcdefghij'])
      expect(isValidBankAbbreviation(valid), valid).toBe(true)
    for (const invalid of ['S', 'ABCDEFGHIJK', '123', 'S$B'])
      expect(isValidBankAbbreviation(invalid), invalid).toBe(false)
  })

  it('searches by name and abbreviation', () => {
    expect(bankSearchLabel({ name: 'State Bank of India' })).toBe(
      'State Bank of India',
    )
    expect(
      bankSearchLabel({ name: 'State Bank of India', abbreviation: 'SBI' }),
    ).toBe('State Bank of India SBI')
  })
})

describe('countries', () => {
  it('lists India first and then countries alphabetically', () => {
    const options = countryOptions()
    expect(options[0]).toEqual({ code: DEFAULT_COUNTRY_CODE, name: 'India' })
    const rest = options.slice(1).map((country) => country.name)
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)))
    expect(options.length).toBeGreaterThan(200)
    expect(options.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(
      true,
    )
  })

  it('resolves names and rejects unknown codes', () => {
    expect(countryName('NP')).toBe('Nepal')
    expect(countryName('ZZ')).toBeNull()
    expect(countryName(null)).toBeNull()
  })
})
