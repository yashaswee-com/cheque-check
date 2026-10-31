// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import catalog from '../../../../supabase/reference/banks.json'
import { bankNameKey } from './bank-name'

describe('dated RBI bank catalog', () => {
  it('includes every extracted source row, without payments banks or duplicate aliases', () => {
    expect(catalog.banks).toHaveLength(1934)
    expect(
      new Set(catalog.banks.map((bank) => bankNameKey(bank.name))).size,
    ).toBe(1934)
    expect(catalog.banks.some((bank) => /payments bank/i.test(bank.name))).toBe(
      false,
    )
    expect(
      catalog.banks.every(
        (bank) => bank.name.length >= 2 && !/[<>\u0000-\u001f]/.test(bank.name),
      ),
    ).toBe(true)
    for (const [index, source] of catalog.sources.entries()) {
      expect(
        catalog.banks.filter((bank) => bank.source === index),
      ).toHaveLength(source.count)
      expect(new URL(source.url).hostname).toMatch(/(^|\.)rbi\.org\.in$/)
    }
  })

  it('covers all documented institution categories', () => {
    expect(
      Object.fromEntries(
        [
          'public',
          'private',
          'small_finance',
          'regional_rural',
          'foreign',
          'urban_cooperative',
          'state_cooperative',
          'district_cooperative',
        ].map((category) => [
          category,
          catalog.banks.filter((bank) => bank.category === category).length,
        ]),
      ),
    ).toEqual({
      public: 12,
      private: 21,
      small_finance: 11,
      regional_rural: 28,
      foreign: 44,
      urban_cooperative: 1432,
      state_cooperative: 34,
      district_cooperative: 352,
    })
  })

  it('keeps migration seeding synchronized with the source snapshot', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [join('scripts', 'generate-bank-seed.mjs'), '--check'],
        { stdio: 'pipe' },
      ),
    ).not.toThrow()
  })
})
