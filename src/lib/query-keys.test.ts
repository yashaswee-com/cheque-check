import { describe, expect, it } from 'vitest'
import { queryKeys } from './query-keys'

describe('query key contracts', () => {
  it('separates entity lists, details and business scopes', () => {
    expect(queryKeys.reportExports.list('b1')).toEqual(['report-exports', 'b1'])
    expect(queryKeys.accounts.list('b1')).toEqual(['accounts', 'b1'])
    expect(queryKeys.accounts.detail('a1')).toEqual(['account', 'a1'])
    expect(queryKeys.banks.list()).toEqual(['master-banks'])
    expect(queryKeys.businesses.all()).toEqual(['businesses'])
    expect(queryKeys.businesses.detail('b1')).toEqual(['business', 'b1'])
    expect(queryKeys.businesses.allCheques()).toEqual([
      'all-businesses-cheques',
    ])
    expect(queryKeys.businesses.summaries()).toEqual([
      'business-cheque-summaries',
    ])
    expect(queryKeys.businesses.summaries('2026-10-31')).toEqual([
      'business-cheque-summaries',
      '2026-10-31',
    ])
    expect(queryKeys.cheques.summaries()).toEqual([
      'cheque-summaries',
      undefined,
    ])
    expect(queryKeys.cheques.list('b1')).toEqual(['cheques', 'b1'])
    expect(queryKeys.cheques.detail('c1')).toEqual(['cheque', 'c1'])
    expect(queryKeys.cheques.pages('b1')).toEqual(['cheque-pages', 'b1'])
    expect(queryKeys.cheques.numberConflict('b1', 'a1', '123456')).toEqual([
      'cheque-number-conflict',
      'b1',
      'a1',
      '123456',
    ])
    expect(queryKeys.parties.list('b1')).toEqual(['parties', 'b1'])
    expect(queryKeys.parties.detail('p1')).toEqual(['party', 'p1'])
    expect(queryKeys.profile.detail()).toEqual(['profile'])
    expect(queryKeys.monetization.transactions()).toEqual(['transactions'])
    expect(queryKeys.monetization.entitlements()).toEqual(['entitlements'])
    expect(queryKeys.monetization.quotas()).toEqual(['quotas'])
  })

  it('separates tag usage, links and entity membership', () => {
    expect(queryKeys.tags.all()).toEqual(['tags'])
    expect(queryKeys.tags.list('b1')).toEqual(['tags', 'b1'])
    expect(queryKeys.tags.listWithUsage('b1')).toEqual(['tags', 'b1', 'usage'])
    expect(queryKeys.tags.allDetail()).toEqual(['tag'])
    expect(queryKeys.tags.detail('t1')).toEqual(['tag', 't1'])
    expect(queryKeys.tags.links('t1')).toEqual(['tag', 't1', 'links'])
    expect(queryKeys.entityTags.all()).toEqual(['entity-tags'])
    expect(queryKeys.entityTags.forEntity('cheque', 'c1')).toEqual([
      'entity-tags',
      'cheque',
      'c1',
    ])
    expect(queryKeys.entityTagMap.all()).toEqual(['entity-tag-map'])
    expect(queryKeys.entityTagMap.forBusiness('b1', 'cheque')).toEqual([
      'entity-tag-map',
      'b1',
      'cheque',
    ])
    expect(queryKeys.entityTagMap.forBusiness('b1', 'cheque', [])).toEqual([
      'entity-tag-map',
      'b1',
      'cheque',
      [],
    ])
    expect(queryKeys.entityTagMap.forBusiness('b1', 'cheque', ['c1'])).toEqual([
      'entity-tag-map',
      'b1',
      'cheque',
      ['c1'],
    ])
  })

  it('separates draft entities and premium workspace resources', () => {
    expect(queryKeys.drafts.list('party', 'b1')).toEqual([
      'drafts',
      'party',
      'b1',
    ])
    const request = { types: [], search: '', ascending: false, page: 0 }
    expect(queryKeys.drafts.page('b1', request).slice(0, 3)).toEqual([
      'drafts',
      'page',
      'b1',
    ])
    expect(queryKeys.drafts.counts('b1')).toEqual(['drafts', 'counts', 'b1'])
    expect(queryKeys.drafts.detail('account', null)).toEqual([
      'draft',
      'account',
      null,
    ])
    expect(queryKeys.premiumWorkspace.all()).toEqual(['premium-workspace'])
    expect(queryKeys.premiumWorkspace.context('b1')).toEqual([
      'premium-workspace',
      'context',
      'b1',
    ])
    expect(queryKeys.premiumWorkspace.tools('b1')).toEqual([
      'premium-workspace',
      'tools',
      'b1',
    ])
    expect(queryKeys.premiumWorkspace.printLayout('a1')).toEqual([
      'premium-workspace',
      'print-layout',
      'a1',
    ])
  })

  it('includes all result-shaping inputs in cheque page and summary keys', () => {
    const request = {
      businessId: 'b1',
      search: '123',
      sortBy: 'amount' as const,
      limit: 10,
    }
    expect(queryKeys.cheques.page(request)).toEqual([
      'cheque-pages',
      'b1',
      request,
    ])
    const range = { from: '2026-10-01', to: '2026-10-31' }
    expect(queryKeys.cheques.summary('b1', '2026-10-31', true, range)).toEqual([
      'cheque-summaries',
      'b1',
      '2026-10-31',
      true,
      range,
    ])
    expect(
      queryKeys.cheques.summary('b1', '2026-10-31', false, range),
    ).not.toEqual(queryKeys.cheques.summary('b1', '2026-10-31', true, range))
  })
})
