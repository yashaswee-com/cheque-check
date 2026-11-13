import { describe, expect, it } from 'vitest'
import { isPublicApiPath, isPublicPagePath } from './public-routes'

describe('public route allowlist', () => {
  it.each([
    '/',
    '/features',
    '/pricing',
    '/privacy',
    '/contact',
    '/sentry-example-page',
  ])('allows the public page %s', (path) =>
    expect(isPublicPagePath(path)).toBe(true),
  )

  it('normalizes trailing slashes but keeps the authenticated feature catalogue private', () => {
    expect(isPublicPagePath('/pricing/')).toBe(true)
    expect(isPublicPagePath('/features/catalog')).toBe(false)
    expect(isPublicPagePath('/settings/privacy-policy')).toBe(false)
  })

  it('allows contact and analytics ingestion, but not nested or private endpoints', () => {
    expect(isPublicApiPath('/api/contact')).toBe(true)
    expect(isPublicApiPath('/api/contact/')).toBe(true)
    expect(isPublicApiPath('/api/contact/messages')).toBe(false)
    expect(isPublicApiPath('/api/analytics/events')).toBe(true)
    expect(isPublicApiPath('/api/analytics/events/private')).toBe(false)
    expect(isPublicApiPath('/api/payments/create-order')).toBe(false)
    expect(isPublicApiPath('/api/sentry-example-api')).toBe(false)
  })
})
