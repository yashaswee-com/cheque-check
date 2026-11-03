import { describe, expect, it } from 'vitest'
import { matchInboxSearch } from './inbox-search'

const labels = {
  cheque_reminder: 'Cheques need your attention',
  export_ready: 'Your report export is ready',
  export_failed: 'Your report export could not be completed',
}
const businesses = [
  { id: 'a', name: 'Acme Traders' },
  { id: 'b', name: null },
]

describe('matchInboxSearch', () => {
  it('returns no match filter for blank searches', () => {
    expect(matchInboxSearch('   ', labels, businesses)).toBeUndefined()
  })
  it('matches localized kind labels and business names case-insensitively', () => {
    expect(matchInboxSearch(' CHEQUE ', labels, businesses)).toEqual({
      kinds: ['cheque_reminder'],
      businessIds: [],
    })
    expect(matchInboxSearch('acme', labels, businesses)).toEqual({
      kinds: [],
      businessIds: ['a'],
    })
  })
  it('returns empty lists when nothing matches so the server returns nothing', () => {
    expect(matchInboxSearch('zzz', labels, businesses)).toEqual({
      kinds: [],
      businessIds: [],
    })
  })
  it('caps business ids to the server limit', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: String(i),
      name: 'Shop',
    }))
    expect(matchInboxSearch('shop', labels, many)?.businessIds).toHaveLength(
      100,
    )
  })
})
