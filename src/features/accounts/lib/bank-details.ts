import type { BankType } from '@/types'

/** Institution kinds a user can pick for a custom bank (never 'custom'). */
export const BANK_TYPES: readonly BankType[] = [
  'public',
  'private',
  'small_finance',
  'payments',
  'regional_rural',
  'urban_cooperative',
  'state_cooperative',
  'district_cooperative',
  'foreign',
]

export function normalizeBankAbbreviation(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase()
}

/** Mirrors banks_abbreviation_check; empty means "no abbreviation". */
export function isValidBankAbbreviation(value: string): boolean {
  const abbreviation = normalizeBankAbbreviation(value)
  return (
    abbreviation === '' ||
    (abbreviation.length >= 2 &&
      abbreviation.length <= 10 &&
      /^[\p{L}\p{N}&. -]+$/u.test(abbreviation) &&
      /\p{L}/u.test(abbreviation))
  )
}

export function bankSearchLabel(bank: {
  name: string
  abbreviation?: string | null
}): string {
  return bank.abbreviation ? `${bank.name} ${bank.abbreviation}` : bank.name
}
