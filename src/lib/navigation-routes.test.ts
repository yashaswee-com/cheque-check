import { describe, expect, it } from 'vitest'
import { getShellRoute, isKeyboardViewport } from './navigation-routes'

describe('shell route classification', () => {
  it.each([
    '/dashboard',
    '/cheques',
    '/cheques/drafts',
    '/cheques/abc',
    '/parties/abc',
    '/accounts/abc',
    '/businesses/abc',
    '/tags/abc',
    '/settings',
    '/settings/transactions',
    '/settings/preferences',
    '/reports',
    '/features',
    '/profile',
    '/feedback',
    '/roadmap',
    '/help',
    '/cheques/id-containing-create',
    '/parties/credit-edit',
  ])('shows bottom navigation on viewing route %s', (path) => {
    expect(getShellRoute(path).showBottomNav).toBe(true)
  })
  it.each([
    '/login',
    '/signup',
    '/forgot-password',
    '/onboarding',
    '/',
    '/premium',
    '/cheques/create',
    '/parties/create',
    '/accounts/create',
    '/businesses/create',
    '/tags/create',
    '/cheques/abc/edit',
    '/parties/abc/edit',
    '/accounts/abc/edit',
    '/tags/abc/edit',
    '/businesses/abc/edit',
  ])('excludes deliberate workflow %s', (path) => {
    expect(getShellRoute(path).showBottomNav).toBe(false)
  })
  it('shares top-level and selected-tab semantics for details', () => {
    expect(getShellRoute('/dashboard').isTopLevel).toBe(true)
    expect(getShellRoute('/cheques/abc').isTopLevel).toBe(false)
    expect(getShellRoute('/cheques/abc').activeTab).toBe('/cheques')
    expect(getShellRoute('/settings/transactions').showBusinessSwitcher).toBe(
      false,
    )
    expect(getShellRoute('/feedback').showBusinessSwitcher).toBe(false)
    expect(getShellRoute('/roadmap').showBusinessSwitcher).toBe(false)
  })
})

describe('keyboard viewport detection', () => {
  it('requires an editable focus and a substantial unzoomed viewport loss', () => {
    const dimensions = { baseline: 800, height: 470, scale: 1 }
    expect(isKeyboardViewport({ ...dimensions, editable: true })).toBe(true)
    expect(isKeyboardViewport({ ...dimensions, editable: false })).toBe(false)
    expect(
      isKeyboardViewport({ ...dimensions, editable: true, scale: 1.5 }),
    ).toBe(false)
    expect(
      isKeyboardViewport({ ...dimensions, editable: true, height: 730 }),
    ).toBe(false)
  })
})
