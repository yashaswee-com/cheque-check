import { describe, expect, it } from 'vitest'
import { draftsHref, parseDraftsParams } from './drafts-params'

const parse = (query: string) => parseDraftsParams(new URLSearchParams(query))

describe('drafts URL params', () => {
  it('defaults to every type, newest first, first page', () => {
    expect(parse('')).toEqual({
      type: null,
      search: '',
      ascending: false,
      page: 0,
    })
  })

  it('reads valid filters with a one-based page', () => {
    expect(parse('type=account&q=sbi&sort=oldest&page=200')).toEqual({
      type: 'account',
      search: 'sbi',
      ascending: true,
      page: 199,
    })
  })

  it.each(['type=tag', 'page=0', 'page=201', 'page=1.5', 'page=abc'])(
    'falls back on malformed values (%s)',
    (query) => {
      expect(parse(query)).toMatchObject({ type: null, page: 0 })
    },
  )

  it('caps search at the server limit', () => {
    expect(parse(`q=${'x'.repeat(150)}`).search).toHaveLength(100)
  })

  it('builds minimal links that round-trip', () => {
    expect(draftsHref()).toBe('/drafts')
    expect(draftsHref({ type: 'party' })).toBe('/drafts?type=party')
    const href = draftsHref({
      type: 'cheque',
      search: ' a&b ',
      ascending: true,
      page: 2,
    })
    expect(href).toBe('/drafts?type=cheque&q=a%26b&sort=oldest&page=3')
    expect(parse(href.split('?')[1])).toEqual({
      type: 'cheque',
      search: 'a&b',
      ascending: true,
      page: 2,
    })
  })
})
