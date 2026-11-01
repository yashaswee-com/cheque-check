import { describe, expect, it } from 'vitest'
import { isPublicApiPath, isPublicPagePath } from './public-routes'

describe('public route allowlist', () => {
  it.each(['/', '/features', '/pricing', '/privacy', '/contact'])(
    'allows the public page %s',
    (path) => {
      expect(isPublicPagePath(path)).toBe(true)
    },
  )

  it('normalizes trailing slashes but keeps the authenticated feature catalogue private', () => {
    expect(isPublicPagePath('/pricing/')).toBe(true)
    expect(isPublicPagePath('/features/catalog')).toBe(false)
    expect(isPublicPagePath('/settings/privacy-policy')).toBe(false)
  })

  it('allows only the contact API and does not allow nested endpoints', () => {
    expect(isPublicApiPath('/api/contact')).toBe(true)
    expect(isPublicApiPath('/api/contact/')).toBe(true)
    expect(isPublicApiPath('/api/contact/messages')).toBe(false)
    expect(isPublicApiPath('/api/payments/create-order')).toBe(false)
  })
})
