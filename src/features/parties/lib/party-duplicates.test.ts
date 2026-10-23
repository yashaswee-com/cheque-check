import { describe, expect, it } from 'vitest'
import { findPossiblePartyDuplicates } from './party-duplicates'

describe('findPossiblePartyDuplicates', () => {
  const parties = [
    { id: 'p1', name: 'Asha Traders', contact: '+91 98765 43210' },
    { id: 'p2', name: 'Other', contact: '09876543210' },
  ]

  it('warns on case-insensitive name and normalized phone matches', () => {
    expect(
      findPossiblePartyDuplicates(parties, ' asha traders ', '', 'IN'),
    ).toEqual(['Asha Traders'])
    expect(
      findPossiblePartyDuplicates(parties, '', '+91-98765-43210', 'IN'),
    ).toEqual(['Asha Traders', 'Other'])
  })

  it('does not flag partial phones or blank names', () => {
    expect(findPossiblePartyDuplicates(parties, '', '3210', 'IN')).toEqual([])
    expect(findPossiblePartyDuplicates(parties, '  ', '', 'IN')).toEqual([])
  })

  it('does not block creating a legitimate separate party', () => {
    expect(
      findPossiblePartyDuplicates(parties, 'Asha Traders', '', 'IN'),
    ).toEqual(['Asha Traders'])
  })
})
